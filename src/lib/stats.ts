import { db } from "./db";

export interface Overview {
  emails: number;
  bytes: number;
  unread: number;
  top10Share: number;
  mostlyUnreadSenders: number;
  senders: number;
  newsletters: number;
  daily: { day: string; count: number }[];
  byAccount: AccountShare[];
}

export interface AccountShare {
  account_id: string;
  provider: string;
  email: string;
  count: number;
  bytes: number;
  unread: number;
}

export interface SenderRow {
  email: string;
  name: string | null;
  count: number;
  bytes: number;
  unread: number;
  inbox: number;
  first: number;
  last: number;
  accounts: string; // comma-separated account emails
  byAccount: AccountShare[]; // how many of this sender's emails are in each connected account
  can_unsub: number;
  unsubscribed: number;
}

const where = (accountId?: string) => (accountId ? "WHERE m.account_id = ?" : "");
const args = (accountId?: string) => (accountId ? [accountId] : []);

export function overview(accountId?: string, days = 180): Overview {
  const d = db();
  const w = where(accountId);
  const a = args(accountId);
  const totals = d.prepare(`SELECT COUNT(*) emails, COALESCE(SUM(size),0) bytes, COALESCE(SUM(unread),0) unread,
    COUNT(DISTINCT from_email) senders FROM messages m ${w}`).get(...a) as { emails: number; bytes: number; unread: number; senders: number };
  const top10 = d.prepare(`SELECT COALESCE(SUM(c),0) n FROM (SELECT COUNT(*) c FROM messages m ${w}
    GROUP BY from_email ORDER BY c DESC LIMIT 10)`).get(...a) as { n: number };
  const mostlyUnread = d.prepare(`SELECT COUNT(*) n FROM (SELECT COUNT(*) c, SUM(unread) u FROM messages m ${w}
    GROUP BY from_email HAVING c >= 10 AND u * 1.0 / c >= 0.9)`).get(...a) as { n: number };
  const newsletters = d.prepare(`SELECT COUNT(DISTINCT from_email) n FROM messages m
    ${w ? w + " AND" : "WHERE"} (unsub_http IS NOT NULL OR unsub_mailto IS NOT NULL)`).get(...a) as { n: number };
  const since = Date.now() - days * 86_400_000;
  const daily = d.prepare(`SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch') day, COUNT(*) count FROM messages m
    ${w ? w + " AND" : "WHERE"} date >= ? GROUP BY day ORDER BY day`).all(...a, since) as { day: string; count: number }[];
  const byAccount = d.prepare(`SELECT acc.id account_id, acc.provider, acc.email, COUNT(m.msg_id) count,
    COALESCE(SUM(m.size),0) bytes, COALESCE(SUM(m.unread),0) unread
    FROM accounts acc LEFT JOIN messages m ON m.account_id = acc.id
    ${accountId ? "WHERE acc.id = ?" : ""} GROUP BY acc.id ORDER BY count DESC`).all(...a) as unknown as AccountShare[];

  return {
    emails: totals.emails,
    bytes: totals.bytes,
    unread: totals.unread,
    senders: totals.senders,
    top10Share: totals.emails ? top10.n / totals.emails : 0,
    mostlyUnreadSenders: mostlyUnread.n,
    newsletters: newsletters.n,
    daily,
    byAccount,
  };
}

export type SenderSort = "count" | "bytes" | "unread" | "last";
export type SenderFilter = "all" | "newsletters" | "mostly-unread";

export function senders(opts: {
  accountId?: string; sort?: SenderSort; filter?: SenderFilter; q?: string; limit?: number; offset?: number;
}): { rows: SenderRow[]; total: number } {
  const { accountId, sort = "count", filter = "all", q, limit = 25, offset = 0 } = opts;
  const conds: string[] = [];
  const a: (string | number)[] = [];
  if (accountId) { conds.push("m.account_id = ?"); a.push(accountId); }
  if (q) { conds.push("(m.from_email LIKE ? OR m.from_name LIKE ?)"); a.push(`%${q}%`, `%${q}%`); }
  const having =
    filter === "newsletters" ? "HAVING can_unsub > 0"
    : filter === "mostly-unread" ? "HAVING count >= 10 AND unread * 1.0 / count >= 0.9"
    : "";
  const order = { count: "count DESC", bytes: "bytes DESC", unread: "unread * 1.0 / count DESC, count DESC", last: "last DESC" }[sort];

  const base = `SELECT m.from_email email, MAX(m.from_name) name, COUNT(*) count, SUM(m.size) bytes, SUM(m.unread) unread,
      SUM(m.in_inbox) inbox, MIN(m.date) first, MAX(m.date) last, GROUP_CONCAT(DISTINCT acc.email) accounts,
      SUM(CASE WHEN m.unsub_http IS NOT NULL OR m.unsub_mailto IS NOT NULL THEN 1 ELSE 0 END) can_unsub,
      MAX(CASE WHEN u.from_email IS NOT NULL THEN 1 ELSE 0 END) unsubscribed
    FROM messages m JOIN accounts acc ON acc.id = m.account_id LEFT JOIN unsubscribed u ON u.from_email = m.from_email
    ${conds.length ? "WHERE " + conds.join(" AND ") : ""} GROUP BY m.from_email ${having}`;

  const d = db();
  const total = (d.prepare(`SELECT COUNT(*) n FROM (${base})`).get(...a) as { n: number }).n;
  const rows = d.prepare(`${base} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...a, limit, offset) as unknown as SenderRow[];

  // Per-account counts for the senders on this page.
  for (const r of rows) r.byAccount = [];
  if (rows.length) {
    const marks = rows.map(() => "?").join(",");
    const split = d.prepare(`SELECT m.from_email, acc.id account_id, acc.provider, acc.email, COUNT(*) count,
        SUM(m.size) bytes, SUM(m.unread) unread
      FROM messages m JOIN accounts acc ON acc.id = m.account_id
      WHERE m.from_email IN (${marks}) ${accountId ? "AND m.account_id = ?" : ""}
      GROUP BY m.from_email, acc.id ORDER BY count DESC`)
      .all(...rows.map((r) => r.email), ...(accountId ? [accountId] : [])) as unknown as (AccountShare & { from_email: string })[];
    const byEmail = new Map(rows.map((r) => [r.email, r]));
    for (const { from_email, ...s } of split) byEmail.get(from_email)?.byAccount.push(s);
  }
  return { rows, total };
}
