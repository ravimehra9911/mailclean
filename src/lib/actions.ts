import dns from "node:dns/promises";
import net from "node:net";
import { db, getAccount } from "./db";
import { moveMessages } from "./accounts";

export type CleanAction = "trash" | "archive";

/** Trash or archive every stored message from the given senders, optionally limited to one account. */
export async function cleanSenders(senders: string[], action: CleanAction, accountId?: string) {
  if (!senders.length) return { count: 0, errors: [] as string[] };
  const marks = senders.map(() => "?").join(",");
  const rows = db().prepare(
    `SELECT account_id, msg_id FROM messages WHERE from_email IN (${marks})
     ${action === "archive" ? "AND in_inbox = 1" : ""} ${accountId ? "AND account_id = ?" : ""}`,
  ).all(...senders, ...(accountId ? [accountId] : [])) as { account_id: string; msg_id: string }[];

  const byAccount = new Map<string, string[]>();
  for (const r of rows) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), r.msg_id]);

  let count = 0;
  const errors: string[] = [];
  for (const [accId, ids] of byAccount) {
    const acc = getAccount(accId);
    if (!acc) continue;
    try {
      await moveMessages(acc, ids, action);
      applyLocally(accId, ids, action);
      count += ids.length;
    } catch (e) {
      errors.push(`${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { count, errors };
}

function applyLocally(accountId: string, ids: string[], action: CleanAction) {
  const d = db();
  const stmt = action === "trash"
    ? d.prepare("DELETE FROM messages WHERE account_id = ? AND msg_id = ?")
    : d.prepare("UPDATE messages SET in_inbox = 0 WHERE account_id = ? AND msg_id = ?");
  d.exec("BEGIN");
  for (const id of ids) stmt.run(accountId, id);
  d.exec("COMMIT");
}

/**
 * Unsubscribe from a sender using the newest List-Unsubscribe header we have.
 * One-click (RFC 8058) is done server-side; otherwise the browser is handed a link or mailto.
 */
export async function unsubscribe(sender: string): Promise<
  { status: "done" } | { status: "open"; url: string } | { status: "none" }
> {
  const row = db().prepare(
    `SELECT m.unsub_http, m.unsub_mailto, m.one_click FROM messages m
     WHERE m.from_email = ? AND (m.unsub_http IS NOT NULL OR m.unsub_mailto IS NOT NULL)
     ORDER BY m.one_click DESC, m.date DESC LIMIT 1`,
  ).get(sender) as { unsub_http: string | null; unsub_mailto: string | null; one_click: number } | undefined;
  if (!row) return { status: "none" };

  const mark = (method: string) =>
    db().prepare("INSERT OR REPLACE INTO unsubscribed (from_email, method, at) VALUES (?, ?, ?)").run(sender, method, Date.now());

  if (row.one_click && row.unsub_http && (await isPublicHttps(row.unsub_http))) {
    const res = await fetch(row.unsub_http, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status < 400) {
      mark("one-click");
      return { status: "done" };
    }
  }
  const url = row.unsub_http ?? row.unsub_mailto!;
  mark(row.unsub_http ? "link" : "mailto");
  return { status: "open", url };
}

/** Guards server-side requests to URLs taken from email headers (SSRF): https only, no private addresses. */
async function isPublicHttps(raw: string): Promise<boolean> {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const addrs = net.isIP(u.hostname) ? [u.hostname] : (await dns.lookup(u.hostname, { all: true })).map((a) => a.address);
    return addrs.length > 0 && addrs.every((ip) => !isPrivate(ip));
  } catch {
    return false;
  }
}

function isPrivate(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivate(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
