import { ImapFlow, type ListResponse } from "imapflow";
import type { MessageMeta } from "../db";
import { parseListUnsubscribe } from "../headers";
import { chunk } from "./types";

// IMAP accounts sign in with an app password instead of OAuth.
export const IMAP_HOSTS = {
  yahoo: { host: "imap.mail.yahoo.com", port: 993, label: "Yahoo Mail" },
} as const;
export type ImapProvider = keyof typeof IMAP_HOSTS;

const SKIP = new Set(["\\Trash", "\\Junk", "\\Sent", "\\Drafts"]);

function client(provider: ImapProvider, email: string, password: string) {
  const { host, port } = IMAP_HOSTS[provider];
  return new ImapFlow({ host, port, secure: true, auth: { user: email, pass: password }, logger: false });
}

async function withClient<T>(provider: ImapProvider, email: string, password: string, fn: (c: ImapFlow) => Promise<T>) {
  const c = client(provider, email, password);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.logout().catch(() => c.close());
  }
}

/** Checks the email and app password by logging in. Throws a readable error on failure. */
export async function verifyLogin(provider: ImapProvider, email: string, password: string) {
  try {
    await withClient(provider, email, password, async () => {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/auth|login|credentials|invalid/i.test(msg + ((e as { responseText?: string }).responseText ?? ""))) {
      throw new Error("Login failed — check the email and use an app password, not your normal password");
    }
    throw new Error(`Could not reach ${IMAP_HOSTS[provider].label}: ${msg}`);
  }
}

// msg_id = "<uidValidity>:<uid>:<folder path>" so trash/archive know where each message lives.
const makeId = (uidValidity: bigint | number, uid: number, path: string) => `${uidValidity}:${uid}:${path}`;
function parseId(id: string) {
  const a = id.indexOf(":");
  const b = id.indexOf(":", a + 1);
  return { uid: Number(id.slice(a + 1, b)), path: id.slice(b + 1) };
}

const folders = async (c: ImapFlow) =>
  (await c.list()).filter((f) => !f.flags.has("\\Noselect") && !(f.specialUse && SKIP.has(f.specialUse)));

const special = (list: ListResponse[], use: string, fallback: string) =>
  list.find((f) => f.specialUse === use)?.path ?? list.find((f) => f.path.toLowerCase() === fallback.toLowerCase())?.path ?? fallback;

export async function imapSync(
  provider: ImapProvider,
  email: string,
  password: string,
  hooks: { onTotal: (n: number) => void; onBatch: (rows: MessageMeta[]) => void; onSeen: (id: string) => void; limit: number },
): Promise<boolean> {
  return withClient(provider, email, password, async (c) => {
    const list = await folders(c);
    let total = 0;
    for (const f of list) total += (await c.status(f.path, { messages: true })).messages ?? 0;
    hooks.onTotal(Math.min(total, hooks.limit));

    let walked = 0;
    for (const f of list) {
      if (walked >= hooks.limit) return false;
      const lock = await c.getMailboxLock(f.path, { readOnly: true });
      try {
        const box = c.mailbox;
        if (!box || !box.exists) continue;
        const inInbox = f.specialUse === "\\Inbox" || f.path.toUpperCase() === "INBOX";
        let batch: MessageMeta[] = [];
        // One FETCH streams headers for the whole folder — far faster than per-message API calls.
        for await (const m of c.fetch("1:*", {
          uid: true, flags: true, size: true, internalDate: true, envelope: true,
          headers: ["list-unsubscribe", "list-unsubscribe-post"],
        })) {
          const id = makeId(box.uidValidity, m.uid, f.path);
          hooks.onSeen(id);
          const raw = m.headers?.toString("utf8") ?? "";
          const header = (name: string) =>
            raw.match(new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n\\S|$)`, "im"))?.[1].replace(/\r?\n\s+/g, " ").trim();
          const unsub = parseListUnsubscribe(header("List-Unsubscribe"), header("List-Unsubscribe-Post"));
          const from = m.envelope?.from?.[0];
          batch.push({
            msg_id: id,
            from_email: (from?.address ?? "unknown").toLowerCase(),
            from_name: from?.name || null,
            date: new Date(m.internalDate ?? m.envelope?.date ?? Date.now()).getTime(),
            size: m.size ?? 0,
            unread: !m.flags?.has("\\Seen"),
            in_inbox: inInbox,
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
    return walked < hooks.limit;
  });
}

async function moveAll(provider: ImapProvider, email: string, password: string, ids: string[], target: "trash" | "archive") {
  const byFolder = new Map<string, number[]>();
  for (const id of ids) {
    const { uid, path } = parseId(id);
    byFolder.set(path, [...(byFolder.get(path) ?? []), uid]);
  }
  await withClient(provider, email, password, async (c) => {
    const all = await c.list();
    const dest = target === "trash" ? special(all, "\\Trash", "Trash") : special(all, "\\Archive", "Archive");
    for (const [path, uids] of byFolder) {
      if (path === dest) continue;
      const lock = await c.getMailboxLock(path);
      try {
        for (const part of chunk(uids, 1000)) await c.messageMove(part.join(","), dest, { uid: true });
      } finally {
        lock.release();
      }
    }
  });
}

export const imapTrash = (p: ImapProvider, email: string, pw: string, ids: string[]) => moveAll(p, email, pw, ids, "trash");
export const imapArchive = (p: ImapProvider, email: string, pw: string, ids: string[]) => moveAll(p, email, pw, ids, "archive");
