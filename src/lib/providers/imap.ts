import { ImapFlow, type ListResponse } from "imapflow";
import { CATEGORY_PRIORITY, type GmailCategory, type MessageMeta } from "../db";
import { parseFrom, parseListUnsubscribe } from "../headers";
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
  /**
   * Fetch the whole header block instead of only List-Unsubscribe. Yahoo/AOL answer
   * BODY[HEADER.FIELDS (LIST-UNSUBSCRIBE …)] with an empty result, so unsubscribe links were missed.
   */
  fullHeaders?: boolean;
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

/** Value of a header in a raw header block, including folded continuation lines. */
export function headerValue(raw: string, name: string) {
  const m = raw.match(new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t]+.*)*)`, "im"));
  return m?.[1].replace(/\r?\n[ \t]+/g, " ").trim();
}

/**
 * Gmail tab of every message in All Mail, by UID. Gmail doesn't expose its tabs as IMAP labels, but its own
 * search does ("category:promotions"), so we ask once per tab. Messages in no other tab are Primary.
 */
async function gmailCategories(c: ImapFlow): Promise<Map<number, GmailCategory>> {
  const byUid = new Map<number, GmailCategory>();
  for (const cat of CATEGORY_PRIORITY) {
    const uids = await c.search({ gmraw: `category:${cat}` }, { uid: true });
    for (const uid of uids || []) if (!byUid.has(uid)) byUid.set(uid, cat);
  }
  return byUid;
}

/** Connects, turning failures into readable errors. */
async function open(cfg: ImapConfig): Promise<ImapFlow> {
  const c = client(cfg);
  try {
    await c.connect();
  } catch (e) {
    throw friendlyError(cfg, e);
  }
  return c;
}

/** Dropped or timed-out connections are worth one more try; login and protocol errors are not. */
function isConnectionError(e: unknown): boolean {
  const err = e as { message?: string; code?: string };
  return /Connection not available|NoConnection|ECONNRESET|EPIPE|ETIMEDOUT|socket|closed|timeout/i.test(`${err.code ?? ""} ${err.message ?? ""}`);
}

export async function imapSync(
  cfg: ImapConfig,
  hooks: {
    onTotal: (n: number) => void; onBatch: (rows: MessageMeta[]) => void; onSeen: (id: string) => void; limit: number;
    onCapped: (folders: string[]) => void;
  },
): Promise<boolean> {
  let c = await open(cfg);
  const reconnect = async () => {
    c.close();
    c = await open(cfg);
  };
  // Fetch in batches: Yahoo drops long-running FETCH streams, especially with full headers.
  const CHUNK = cfg.fullHeaders ? 500 : 2000;
  try {
    const { folders, allMail } = scanPlan(await c.list());
    const sizes = new Map<string, number>();
    for (const f of folders) sizes.set(f.path, (await c.status(f.path, { messages: true })).messages ?? 0);
    hooks.onTotal(Math.min([...sizes.values()].reduce((a, b) => a + b, 0), hooks.limit));

    let walked = 0;
    const capped: string[] = [];
    for (const f of folders) {
      if (!(sizes.get(f.path) ?? 0)) continue;
      // Use the count visible after opening the folder: Yahoo/AOL report the full size in STATUS
      // but only expose the newest 10,000 messages once selected.
      let exists = 0;
      let categories: Map<number, GmailCategory> | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          const lock = await c.getMailboxLock(f.path, { readOnly: true });
          try {
            exists = c.mailbox ? c.mailbox.exists : 0;
            if (allMail && exists) categories = await gmailCategories(c);
          } finally { lock.release(); }
          break;
        } catch (e) {
          if (attempt >= 3 || !isConnectionError(e)) throw e;
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          await reconnect();
        }
      }
      if (!exists) continue;
      const folderIsInbox = isInboxFolder(f);
      if (cfg.folderCap && exists >= cfg.folderCap) capped.push(folderIsInbox ? "Inbox" : f.name || f.path);

      for (let from = 1; from <= exists; from += CHUNK) {
        if (walked >= hooks.limit) return false;
        const range = `${from}:${Math.min(exists, from + CHUNK - 1)}`;
        let rows: MessageMeta[] = [];
        for (let attempt = 0; ; attempt++) {
          rows = [];
          try {
            const lock = await c.getMailboxLock(f.path, { readOnly: true });
            try {
              const box = c.mailbox;
              if (!box) break;
              // Only the header fields we use — not the IMAP envelope, which includes the subject line.
              // Yahoo/AOL can't return single fields (see fullHeaders); their header block is parsed for these only.
              for await (const m of c.fetch(range, {
                uid: true, flags: true, size: true, internalDate: true, labels: allMail,
                headers: cfg.fullHeaders ? true : ["from", "date", "list-unsubscribe", "list-unsubscribe-post"],
              })) {
                const labels = m.labels ?? new Set<string>();
                // In Gmail's All Mail, skip your own sent mail and drafts unless they are also in the inbox.
                if (allMail && (labels.has("\\Sent") || labels.has("\\Draft")) && !labels.has("\\Inbox")) continue;
                const raw = m.headers?.toString("utf8") ?? "";
                const unsub = parseListUnsubscribe(headerValue(raw, "List-Unsubscribe"), headerValue(raw, "List-Unsubscribe-Post"));
                const sender = parseFrom(headerValue(raw, "From"));
                const sent = Date.parse(headerValue(raw, "Date") ?? "");
                rows.push({
                  msg_id: makeId(box.uidValidity, m.uid, f.path),
                  from_email: sender.email,
                  from_name: sender.name,
                  date: m.internalDate ? new Date(m.internalDate).getTime() : Number.isNaN(sent) ? Date.now() : sent,
                  size: m.size ?? 0,
                  unread: !m.flags?.has("\\Seen"),
                  in_inbox: allMail ? labels.has("\\Inbox") : folderIsInbox,
                  unsub_http: unsub.http,
                  unsub_mailto: unsub.mailto,
                  one_click: unsub.oneClick,
                  category: categories ? categories.get(m.uid) ?? "primary" : null,
                  starred: !!m.flags?.has("\\Flagged"),
                  important: labels.has("\\Important"),
                });
              }
            } finally {
              lock.release();
            }
            break;
          } catch (e) {
            // Reconnect and retry this batch a few times before giving up.
            if (attempt >= 3 || !isConnectionError(e)) throw e;
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            await reconnect();
          }
        }
        const take = rows.slice(0, hooks.limit - walked);
        for (const r of take) hooks.onSeen(r.msg_id);
        hooks.onBatch(take);
        walked += take.length;
      }
    }
    hooks.onCapped(capped);
    return walked < hooks.limit;
  } finally {
    await c.logout().catch(() => c.close());
  }
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
