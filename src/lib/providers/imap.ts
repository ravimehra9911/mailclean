import { ImapFlow, type ListResponse } from "imapflow";
import type { MessageMeta } from "../db";
import { parseListUnsubscribe } from "../headers";
import { chunk } from "./types";

/** Connection details for an app-password IMAP account. */
export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Provider name for messages, e.g. "Yahoo Mail". */
  label: string;
  /** Server only exposes the newest N messages per folder (Yahoo, AOL). */
  folderCap?: number;
}

// Folders whose mail we never count or clean.
const SKIP = new Set(["\\Trash", "\\Junk", "\\Sent", "\\Drafts"]);

function client(cfg: ImapConfig) {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true, // TLS only; we never send passwords over plain connections
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    socketTimeout: 120_000,
  });
}

async function withClient<T>(cfg: ImapConfig, fn: (c: ImapFlow) => Promise<T>) {
  const c = client(cfg);
  try {
    await c.connect();
  } catch (e) {
    throw friendlyError(cfg, e);
  }
  try {
    return await fn(c);
  } finally {
    await c.logout().catch(() => c.close());
  }
}

/** Turns IMAP connection errors into messages a user can act on. */
function friendlyError(cfg: ImapConfig, e: unknown): Error {
  const err = e as { message?: string; responseText?: string; authenticationFailed?: boolean; code?: string };
  const text = `${err.message ?? ""} ${err.responseText ?? ""}`;
  if (err.authenticationFailed || /auth|login|credentials|password|invalid/i.test(text)) {
    return new Error(`${cfg.label} rejected the login. Check the email address and create a new app password — your normal password won't work.`);
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(`${err.code} ${text}`)) return new Error(`Can't find the server ${cfg.host}. Check the server name and your internet connection.`);
  if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|timeout/i.test(`${err.code} ${text}`)) {
    return new Error(`Can't connect to ${cfg.host}:${cfg.port}. Check your internet connection and that IMAP is enabled.`);
  }
  return new Error(`${cfg.label}: ${err.message ?? String(e)}`);
}

/** Checks the login. Throws a readable error on failure. */
export async function verifyLogin(cfg: ImapConfig) {
  await withClient(cfg, async () => {});
}

// msg_id = "<uidValidity>:<uid>:<folder path>" so trash/archive know where each message lives.
const makeId = (uidValidity: bigint | number, uid: number, path: string) => `${uidValidity}:${uid}:${path}`;
function parseId(id: string) {
  const a = id.indexOf(":");
  const b = id.indexOf(":", a + 1);
  return { uid: Number(id.slice(a + 1, b)), path: id.slice(b + 1) };
}

const selectable = (list: ListResponse[]) => list.filter((f) => !f.flags.has("\\Noselect"));
const isInboxFolder = (f: ListResponse) => f.specialUse === "\\Inbox" || f.path.toUpperCase() === "INBOX";

/**
 * Gmail exposes labels as folders, so the same email appears in several of them. When the server has an
 * "All Mail" folder (\All) we scan only that one and read Gmail labels instead.
 */
function scanPlan(list: ListResponse[]): { folders: ListResponse[]; allMail: boolean } {
  const all = list.find((f) => f.specialUse === "\\All");
  if (all) return { folders: [all], allMail: true };
  return { folders: selectable(list).filter((f) => !(f.specialUse && SKIP.has(f.specialUse))), allMail: false };
}

const special = (list: ListResponse[], use: string, fallback: string) =>
  list.find((f) => f.specialUse === use)?.path ?? list.find((f) => f.path.toLowerCase() === fallback.toLowerCase())?.path ?? fallback;

function headerValue(raw: string, name: string) {
  return raw.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n\\S|$)`, "im"))?.[1].replace(/\r?\n\s+/g, " ").trim();
}

export async function imapSync(
  cfg: ImapConfig,
  hooks: {
    onTotal: (n: number) => void; onBatch: (rows: MessageMeta[]) => void; onSeen: (id: string) => void; limit: number;
    onCapped: (folders: string[]) => void;
  },
): Promise<boolean> {
  return withClient(cfg, async (c) => {
    const { folders, allMail } = scanPlan(await c.list());
    let total = 0;
    for (const f of folders) total += (await c.status(f.path, { messages: true })).messages ?? 0;
    hooks.onTotal(Math.min(total, hooks.limit));

    let walked = 0;
    const capped: string[] = [];
    for (const f of folders) {
      if (walked >= hooks.limit) return false;
      const lock = await c.getMailboxLock(f.path, { readOnly: true });
      try {
        const box = c.mailbox;
        if (!box || !box.exists) continue;
        const folderIsInbox = isInboxFolder(f);
        if (cfg.folderCap && box.exists >= cfg.folderCap) capped.push(folderIsInbox ? "Inbox" : f.name || f.path);
        let batch: MessageMeta[] = [];
        // One FETCH streams headers for the whole folder — far faster than per-message API calls.
        for await (const m of c.fetch("1:*", {
          uid: true, flags: true, size: true, internalDate: true, envelope: true, labels: allMail,
          headers: ["list-unsubscribe", "list-unsubscribe-post"],
        })) {
          const id = makeId(box.uidValidity, m.uid, f.path);
          const labels = m.labels ?? new Set<string>();
          // In Gmail's All Mail, skip your own sent mail and drafts unless they are also in the inbox.
          if (allMail && (labels.has("\\Sent") || labels.has("\\Draft")) && !labels.has("\\Inbox")) continue;
          hooks.onSeen(id);
          const raw = m.headers?.toString("utf8") ?? "";
          const unsub = parseListUnsubscribe(headerValue(raw, "List-Unsubscribe"), headerValue(raw, "List-Unsubscribe-Post"));
          const from = m.envelope?.from?.[0];
          batch.push({
            msg_id: id,
            from_email: (from?.address ?? "unknown").toLowerCase(),
            from_name: from?.name || null,
            date: new Date(m.internalDate ?? m.envelope?.date ?? Date.now()).getTime(),
            size: m.size ?? 0,
            unread: !m.flags?.has("\\Seen"),
            in_inbox: allMail ? labels.has("\\Inbox") : folderIsInbox,
            unsub_http: unsub.http,
            unsub_mailto: unsub.mailto,
            one_click: unsub.oneClick,
          });
          if (batch.length >= 500) { hooks.onBatch(batch); batch = []; }
          if (++walked >= hooks.limit) break;
        }
        hooks.onBatch(batch);
      } finally {
        lock.release();
      }
    }
    hooks.onCapped(capped);
    return walked < hooks.limit;
  });
}

async function moveAll(cfg: ImapConfig, ids: string[], target: "trash" | "archive") {
  const byFolder = new Map<string, number[]>();
  for (const id of ids) {
    const { uid, path } = parseId(id);
    byFolder.set(path, [...(byFolder.get(path) ?? []), uid]);
  }
  await withClient(cfg, async (c) => {
    const all = await c.list();
    const allMail = all.find((f) => f.specialUse === "\\All")?.path;
    const trash = special(all, "\\Trash", "Trash");
    for (const [path, uids] of byFolder) {
      const lock = await c.getMailboxLock(path);
      try {
        for (const part of chunk(uids, 1000)) {
          const range = part.join(",");
          if (target === "trash") {
            if (path !== trash) await c.messageMove(range, trash, { uid: true });
          } else if (path === allMail) {
            // Gmail: archiving = removing the Inbox label.
            await c.messageFlagsRemove(range, ["\\Inbox"], { uid: true, useLabels: true });
          } else {
            const archive = special(all, "\\Archive", "Archive");
            if (path !== archive) await c.messageMove(range, archive, { uid: true });
          }
        }
      } finally {
        lock.release();
      }
    }
  });
}

export const imapTrash = (cfg: ImapConfig, ids: string[]) => moveAll(cfg, ids, "trash");
export const imapArchive = (cfg: ImapConfig, ids: string[]) => moveAll(cfg, ids, "archive");
