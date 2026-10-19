import { db, isGmailCategory, type GmailCategory } from "./db";

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
  /** Years that have mail (for the date filter), newest first. */
  years: number[];
  /** Emails per Gmail tab in this scope (ignoring the category filter); empty when no Gmail data. */
  categories: { category: GmailCategory; count: number; unread: number; bytes: number }[];
  /** Ready-made clean-ups for the Overview: emails older than a year, and senders you (almost) never open. */
  suggestions: {
    old: { count: number; bytes: number; before: number };
    neverOpened: { senders: number; count: number; bytes: number };
  };
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
  /** The Gmail tab most of this sender's emails land in, and the share of their Gmail emails in it. */
  category: GmailCategory | null;
  category_share: number;
}

/** Which messages a query covers: one account or all, and an optional date range (epoch ms, `to` exclusive). */
export interface Scope {
  accountId?: string;
  from?: number;
  to?: number;
  /** Senders to leave out (the web demo's per-visitor "trashed" list). */
  exclude?: string[];
  /** Only emails in this Gmail tab. */
  category?: GmailCategory;
}

/** SQL conditions on `messages m` for a scope, with their parameters. */
export function scopeSql(s: Scope, alias = "m"): { conds: string[]; args: (string | number)[] } {
  const conds: string[] = [];
  const args: (string | number)[] = [];
  if (s.accountId) { conds.push(`${alias}.account_id = ?`); args.push(s.accountId); }
  if (s.from !== undefined) { conds.push(`${alias}.date >= ?`); args.push(s.from); }
  if (s.to !== undefined) { conds.push(`${alias}.date < ?`); args.push(s.to); }
  if (s.category) { conds.push(`${alias}.category = ?`); args.push(s.category); }
  if (s.exclude?.length) { conds.push(`${alias}.from_email NOT IN (${s.exclude.map(() => "?").join(",")})`); args.push(...s.exclude); }
  return { conds, args };
}

const whereOf = (conds: string[], extra: string[] = []) => {
  const all = [...conds, ...extra];
  return all.length ? `WHERE ${all.join(" AND ")}` : "";
};

export function overview(scope: Scope): Overview {
  const d = db();
  const { conds, args } = scopeSql(scope);
  const w = whereOf(conds);
  const totals = d.prepare(`SELECT COUNT(*) emails, COALESCE(SUM(size),0) bytes, COALESCE(SUM(unread),0) unread,
    COUNT(DISTINCT from_email) senders FROM messages m ${w}`).get(...args) as { emails: number; bytes: number; unread: number; senders: number };
  const top10 = d.prepare(`SELECT COALESCE(SUM(c),0) n FROM (SELECT COUNT(*) c FROM messages m ${w}
    GROUP BY from_email ORDER BY c DESC LIMIT 10)`).get(...args) as { n: number };
  const mostlyUnread = d.prepare(`SELECT COUNT(*) n FROM (SELECT COUNT(*) c, SUM(unread) u FROM messages m ${w}
    GROUP BY from_email HAVING c >= 10 AND u * 1.0 / c >= 0.9)`).get(...args) as { n: number };
  const newsletters = d.prepare(`SELECT COUNT(DISTINCT from_email) n FROM messages m
    ${whereOf(conds, ["(unsub_http IS NOT NULL OR unsub_mailto IS NOT NULL)"])}`).get(...args) as { n: number };

  // Chart: the selected range, or the last 6 months when no range is set.
  const chartFrom = scope.from ?? Date.now() - 180 * 86_400_000;
  const chart = scopeSql({ ...scope, from: chartFrom });
  const daily = d.prepare(`SELECT strftime('%Y-%m-%d', date / 1000, 'unixepoch', 'localtime') day, COUNT(*) count FROM messages m
    ${whereOf(chart.conds)} GROUP BY day ORDER BY day`).all(...chart.args) as { day: string; count: number }[];

  // Per-account totals: date conditions go in the JOIN so accounts with no mail in range still show.
  const dates = scopeSql({ from: scope.from, to: scope.to, exclude: scope.exclude, category: scope.category });
  const byAccount = d.prepare(`SELECT acc.id account_id, acc.provider, acc.email, COUNT(m.msg_id) count,
    COALESCE(SUM(m.size),0) bytes, COALESCE(SUM(m.unread),0) unread
    FROM accounts acc LEFT JOIN messages m ON m.account_id = acc.id ${dates.conds.map((c) => `AND ${c}`).join(" ")}
    ${scope.accountId ? "WHERE acc.id = ?" : ""} GROUP BY acc.id ORDER BY count DESC`)
    .all(...dates.args, ...(scope.accountId ? [scope.accountId] : [])) as unknown as AccountShare[];

  const acc = scopeSql({ accountId: scope.accountId });
  const years = (d.prepare(`SELECT DISTINCT CAST(strftime('%Y', date / 1000, 'unixepoch', 'localtime') AS INTEGER) y
    FROM messages m ${whereOf(acc.conds)} ORDER BY y DESC`).all(...acc.args) as { y: number }[]).map((r) => r.y)
    .filter((y) => y >= 1995); // emails with missing dates show up as 1970

  const cat = scopeSql({ ...scope, category: undefined });
  const categories = d.prepare(`SELECT category, COUNT(*) count, SUM(unread) unread, SUM(size) bytes FROM messages m
    ${whereOf(cat.conds, ["category IS NOT NULL"])} GROUP BY category ORDER BY count DESC`).all(...cat.args) as unknown as Overview["categories"];

  const before = Date.now() - 365 * 86_400_000;
  const old = d.prepare(`SELECT COUNT(*) count, COALESCE(SUM(size),0) bytes FROM messages m ${whereOf(conds, ["m.date < ?"])}`)
    .get(...args, before) as { count: number; bytes: number };
  const neverOpened = d.prepare(`SELECT COUNT(*) senders, COALESCE(SUM(c),0) count, COALESCE(SUM(b),0) bytes FROM
    (SELECT COUNT(*) c, SUM(unread) u, SUM(size) b FROM messages m ${w} GROUP BY from_email HAVING c >= 10 AND u * 1.0 / c >= 0.9)`)
    .get(...args) as { senders: number; count: number; bytes: number };

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
    years,
    categories,
    suggestions: { old: { ...old, before }, neverOpened },
  };
}

export type SenderSort = "name" | "account" | "count" | "bytes" | "unread" | "last";
export type SortDir = "asc" | "desc";
export type SenderFilter = "all" | "newsletters" | "mostly-unread";

// Whitelisted ORDER BY expressions; the direction is appended, with a stable tie-breaker.
const SORT_SQL: Record<SenderSort, string> = {
  name: "LOWER(COALESCE(name, email))",
  account: "LOWER(first_account)",
  count: "count",
  bytes: "bytes",
  unread: "unread * 1.0 / count",
  last: "last",
};

export function senders(opts: Scope & {
  sort?: SenderSort; dir?: SortDir; filter?: SenderFilter; q?: string; limit?: number; offset?: number;
}): { rows: SenderRow[]; total: number } {
  const { sort = "count", filter = "all", q, limit = 25, offset = 0 } = opts;
  const dir = opts.dir === "asc" ? "ASC" : "DESC";
  const { conds, args } = scopeSql(opts);
  if (q) { conds.push("(m.from_email LIKE ? OR m.from_name LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  const having =
    filter === "newsletters" ? "HAVING can_unsub > 0"
    : filter === "mostly-unread" ? "HAVING count >= 10 AND unread * 1.0 / count >= 0.9"
    : "";
  const order = `${SORT_SQL[sort] ?? SORT_SQL.count} ${dir}, count DESC, email ASC`;

  const base = `SELECT m.from_email email, MAX(m.from_name) name, COUNT(*) count, SUM(m.size) bytes, SUM(m.unread) unread,
      SUM(m.in_inbox) inbox, MIN(m.date) first, MAX(m.date) last, GROUP_CONCAT(DISTINCT acc.email) accounts,
      MIN(acc.email) first_account,
      SUM(CASE WHEN m.unsub_http IS NOT NULL OR m.unsub_mailto IS NOT NULL THEN 1 ELSE 0 END) can_unsub,
      MAX(CASE WHEN u.from_email IS NOT NULL THEN 1 ELSE 0 END) unsubscribed
    FROM messages m JOIN accounts acc ON acc.id = m.account_id LEFT JOIN unsubscribed u ON u.from_email = m.from_email
    ${whereOf(conds)} GROUP BY m.from_email ${having}`;

  const d = db();
  const total = (d.prepare(`SELECT COUNT(*) n FROM (${base})`).get(...args) as { n: number }).n;
  const rows = d.prepare(`${base} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset) as unknown as SenderRow[];

  // Per-account counts for the senders on this page (same scope).
  for (const r of rows) { r.byAccount = []; r.category = null; r.category_share = 0; }
  if (rows.length) {
    const s = scopeSql(opts);
    const marks = rows.map(() => "?").join(",");
    const split = d.prepare(`SELECT m.from_email, acc.id account_id, acc.provider, acc.email, COUNT(*) count,
        SUM(m.size) bytes, SUM(m.unread) unread
      FROM messages m JOIN accounts acc ON acc.id = m.account_id
      ${whereOf(s.conds, [`m.from_email IN (${marks})`])}
      GROUP BY m.from_email, acc.id ORDER BY count DESC`)
      .all(...s.args, ...rows.map((r) => r.email)) as unknown as (AccountShare & { from_email: string })[];
    const byEmail = new Map(rows.map((r) => [r.email, r]));
    for (const { from_email, ...sh } of split) byEmail.get(from_email)?.byAccount.push(sh);

    // Main Gmail tab per sender (rows come largest first, so the first one per sender wins).
    const cats = d.prepare(`SELECT m.from_email, m.category, COUNT(*) n, SUM(COUNT(*)) OVER (PARTITION BY m.from_email) total
      FROM messages m ${whereOf(s.conds, [`m.from_email IN (${marks})`, "m.category IS NOT NULL"])}
      GROUP BY m.from_email, m.category ORDER BY n DESC`)
      .all(...s.args, ...rows.map((r) => r.email)) as { from_email: string; category: GmailCategory; n: number; total: number }[];
    for (const c of cats) {
      const r = byEmail.get(c.from_email);
      if (r && !r.category) { r.category = c.category; r.category_share = c.n / c.total; }
    }
  }
  return { rows, total };
}

/** Parses `account`, `from`, `to` and `category` query parameters into a Scope. */
export function scopeFromParams(p: URLSearchParams): Scope {
  const num = (k: string) => {
    const v = Number(p.get(k));
    return p.get(k) && Number.isFinite(v) ? v : undefined;
  };
  const category = p.get("category");
  return { accountId: p.get("account") || undefined, from: num("from"), to: num("to"), category: isGmailCategory(category) ? category : undefined };
}
