import dns from "node:dns/promises";
import net from "node:net";
import { db, getAccount } from "./db";
import { moveMessages } from "./accounts";
import { scopeSql, type Scope } from "./stats";
import { isDemo } from "./demo";

export type CleanAction = "trash" | "archive";

/** What a clean-up leaves alone. */
export interface CleanOptions {
  /** Starred and important emails. */
  keepFlagged?: boolean;
  /** The newest N emails from each sender (within the scope). */
  keepNewest?: number;
}

/** Parses clean options from a request body, ignoring anything invalid. */
export function cleanOptions(body: { keepFlagged?: unknown; keepNewest?: unknown }): CleanOptions {
  const n = Number(body.keepNewest);
  return { keepFlagged: body.keepFlagged === true, keepNewest: Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0 };
}

/** SQL selecting the messages a clean-up touches: these senders, in scope, minus what the options keep. */
export function cleanQuery(senders: string[], action: CleanAction, scope: Scope, opts: CleanOptions = {}, what = "m.account_id, m.msg_id") {
  const marks = senders.map(() => "?").join(",");
  const { conds, args } = scopeSql(scope);
  if (action === "archive") conds.push("m.in_inbox = 1");
  if (opts.keepFlagged) conds.push("m.starred = 0 AND m.important = 0");
  if (opts.keepNewest) {
    const k = scopeSql(scope, "k");
    conds.push(`m.rowid NOT IN (SELECT rid FROM (SELECT k.rowid rid, ROW_NUMBER() OVER (PARTITION BY k.from_email ORDER BY k.date DESC) rn
      FROM messages k WHERE k.from_email IN (${marks}) ${k.conds.map((c) => `AND ${c}`).join(" ")}) WHERE rn <= ?)`);
    args.push(...senders, ...k.args, opts.keepNewest);
  }
  return {
    sql: `SELECT ${what} FROM messages m WHERE m.from_email IN (${marks}) ${conds.map((c) => `AND ${c}`).join(" ")}`,
    args: [...senders, ...args],
  };
}

/**
 * Trash or archive the stored messages from the given senders within a scope (optionally one account, a date
 * range and a Gmail tab — the same view the user is looking at), minus what `opts` keeps.
 */
export async function cleanSenders(senders: string[], action: CleanAction, scope: Scope = {}, opts: CleanOptions = {}) {
  if (!senders.length) return { count: 0, errors: [] as string[] };
  const q = cleanQuery(senders, action, scope, opts);
  const rows = db().prepare(q.sql).all(...q.args) as { account_id: string; msg_id: string }[];

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

export function applyLocally(accountId: string, ids: string[], action: CleanAction) {
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
  if (isDemo()) {
    mark("one-click");
    return { status: "done" };
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

export type UnsubMethod = "one-click" | "link" | "mailto" | "none";

export interface UnsubPlan {
  sender: string;
  name: string | null;
  /** one-click: done in the background (RFC 8058); link/mailto: the user finishes on the sender's page. */
  method: UnsubMethod;
  already: boolean;
}

/** How each sender can be unsubscribed, for the bulk-unsubscribe confirmation. */
export function unsubscribePlan(senders: string[], alreadyExtra: string[] = []): UnsubPlan[] {
  const best = db().prepare(
    `SELECT m.unsub_http, m.unsub_mailto, m.one_click FROM messages m
     WHERE m.from_email = ? AND (m.unsub_http IS NOT NULL OR m.unsub_mailto IS NOT NULL)
     ORDER BY m.one_click DESC, m.date DESC LIMIT 1`,
  );
  const name = db().prepare("SELECT MAX(from_name) n FROM messages WHERE from_email = ?");
  const done = db().prepare("SELECT 1 FROM unsubscribed WHERE from_email = ?");
  return senders.map((sender) => {
    const row = best.get(sender) as { unsub_http: string | null; unsub_mailto: string | null; one_click: number } | undefined;
    const method: UnsubMethod = !row ? "none"
      : row.one_click && row.unsub_http?.startsWith("https://") ? "one-click"
      : row.unsub_http ? "link" : "mailto";
    return {
      sender,
      name: (name.get(sender) as { n: string | null } | undefined)?.n ?? null,
      method,
      already: !!done.get(sender) || alreadyExtra.includes(sender),
    };
  });
}

/**
 * Bulk unsubscribe: runs one-click unsubscribes in the background (a few at a time). Senders that only
 * offer a web page are not touched here — the user opens those pages themselves after confirming.
 * A failed one-click falls back to "link" so the user can still finish on the sender's page.
 */
export async function bulkUnsubscribe(senders: string[]): Promise<{
  results: { sender: string; status: "done" | "failed" }[];
  links: { sender: string; url: string }[];
}> {
  const plan = unsubscribePlan(senders).filter((p) => !p.already && p.method !== "none");
  const { pool } = await import("./providers/types");
  const oneClick = await pool(plan.filter((p) => p.method === "one-click"), 4, async (p) => {
    try {
      const r = await oneClickOnly(p.sender);
      return { sender: p.sender, status: r ? "done" as const : "failed" as const };
    } catch {
      return { sender: p.sender, status: "failed" as const };
    }
  });
  // Pages for the user to open: link/mailto senders, plus one-click senders that failed.
  const failed = new Set(oneClick.filter((r) => r.status === "failed").map((r) => r.sender));
  const links = plan
    .filter((p) => p.method === "link" || p.method === "mailto" || failed.has(p.sender))
    .map((p) => ({ sender: p.sender, url: unsubscribeUrl(p.sender) }))
    .filter((l): l is { sender: string; url: string } => !!l.url);
  return { results: oneClick, links };
}

/** The sender's unsubscribe page (https) or mailto link, if any. */
export function unsubscribeUrl(sender: string): string | null {
  const row = db().prepare(
    `SELECT unsub_http, unsub_mailto FROM messages WHERE from_email = ? AND (unsub_http IS NOT NULL OR unsub_mailto IS NOT NULL)
     ORDER BY date DESC LIMIT 1`,
  ).get(sender) as { unsub_http: string | null; unsub_mailto: string | null } | undefined;
  const url = row?.unsub_http ?? row?.unsub_mailto ?? null;
  return url && /^(https?:|mailto:)/i.test(url) ? url : null;
}

/** One-click unsubscribe only (no fallback); marks the sender on success. */
async function oneClickOnly(sender: string): Promise<boolean> {
  const row = db().prepare(
    `SELECT unsub_http FROM messages WHERE from_email = ? AND one_click = 1 AND unsub_http IS NOT NULL ORDER BY date DESC LIMIT 1`,
  ).get(sender) as { unsub_http: string } | undefined;
  if (!row || !(await isPublicHttps(row.unsub_http))) return false;
  const res = await fetch(row.unsub_http, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status >= 400) return false;
  db().prepare("INSERT OR REPLACE INTO unsubscribed (from_email, method, at) VALUES (?, 'one-click', ?)").run(sender, Date.now());
  return true;
}

/** Records that the user opened a sender's unsubscribe page. */
export function markUnsubscribed(sender: string, method: "link" | "mailto") {
  db().prepare("INSERT OR REPLACE INTO unsubscribed (from_email, method, at) VALUES (?, ?, ?)").run(sender, method, Date.now());
}
