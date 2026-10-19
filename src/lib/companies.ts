// "Who has your email": senders grouped by company (their website's domain), from data already stored.
import { db } from "./db";

/** Second-level suffixes where the company name is one label further left (e.g. swiggy.co.in). */
const TWO_PART = new Set([
  "co.in", "org.in", "net.in", "gov.in", "ac.in", "edu.in", "firm.in", "gen.in", "ind.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "co.kr",
  "com.br", "com.mx", "com.sg", "com.my", "com.hk", "com.tr", "co.za", "com.ar", "com.cn", "com.tw",
]);

/** Personal mailbox domains: people, not companies. */
const PERSONAL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "zoho.com", "zohomail.com", "zohomail.in", "protonmail.com", "proton.me", "rediffmail.com", "gmx.com",
  "mail.com", "yandex.com", "fastmail.com", "hey.com",
]);

/** Senders that send sign-in and account-security notices. */
const SECURITY = [
  /^no-reply@accounts\.google\.com$/, /@accountprotection\.microsoft\.com$/, /@id\.apple\.com$/,
  /^security@facebookmail\.com$/, /^security@mail\.instagram\.com$/, /^security-noreply@linkedin\.com$/,
  /^account-update@amazon\./, /^no-reply@cc\.yahoo-inc\.com$/, /^verify@x\.com$/, /^noreply@github\.com$/,
];

export function companyDomain(email: string): string | null {
  const host = email.split("@")[1]?.toLowerCase();
  if (!host || !host.includes(".")) return null;
  const parts = host.split(".");
  const take = parts.length > 2 && TWO_PART.has(parts.slice(-2).join(".")) ? 3 : 2;
  const domain = parts.slice(-take).join(".");
  return PERSONAL.has(domain) ? null : domain;
}

export interface Company {
  domain: string;
  name: string;
  first: number;
  last: number;
  count: number;
  /** Sender addresses at this company. */
  senders: string[];
  /** Senders here that offer unsubscribe and you haven't unsubscribed from. */
  unsubscribable: string[];
  security: boolean;
  quiet: boolean;
}

export type CompanyFilter = "all" | "security" | "quiet" | "newsletters";

const YEAR = 365 * 86_400_000;

/** Every company that has emailed you, biggest first. `unsubscribed` adds senders unsubscribed elsewhere (demo). */
export function companies(opts: { accountId?: string; unsubscribed?: string[] } = {}): Company[] {
  const rows = db().prepare(`SELECT m.from_email email, MAX(m.from_name) name, COUNT(*) count, MIN(m.date) first, MAX(m.date) last,
      MAX(CASE WHEN m.unsub_http IS NOT NULL OR m.unsub_mailto IS NOT NULL THEN 1 ELSE 0 END) can_unsub,
      MAX(CASE WHEN u.from_email IS NOT NULL THEN 1 ELSE 0 END) unsubscribed
    FROM messages m LEFT JOIN unsubscribed u ON u.from_email = m.from_email
    ${opts.accountId ? "WHERE m.account_id = ?" : ""} GROUP BY m.from_email`)
    .all(...(opts.accountId ? [opts.accountId] : [])) as {
      email: string; name: string | null; count: number; first: number; last: number; can_unsub: number; unsubscribed: number;
    }[];
  const done = new Set(opts.unsubscribed ?? []);
  const byDomain = new Map<string, Company & { names: Map<string, number> }>();
  for (const r of rows) {
    const domain = companyDomain(r.email);
    if (!domain) continue;
    let c = byDomain.get(domain);
    if (!c) {
      c = { domain, name: "", first: r.first, last: r.last, count: 0, senders: [], unsubscribable: [], security: false, quiet: false, names: new Map() };
      byDomain.set(domain, c);
    }
    c.count += r.count;
    c.first = Math.min(c.first, r.first);
    c.last = Math.max(c.last, r.last);
    c.senders.push(r.email);
    if (r.can_unsub && !r.unsubscribed && !done.has(r.email)) c.unsubscribable.push(r.email);
    if (SECURITY.some((p) => p.test(r.email))) c.security = true;
    if (r.name) c.names.set(r.name, (c.names.get(r.name) ?? 0) + r.count);
  }
  const now = Date.now();
  return [...byDomain.values()].map(({ names, ...c }) => {
    // The display name most of its emails use, else the domain's main label ("swiggy" → "Swiggy").
    const best = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const label = c.domain.split(".")[0];
    return { ...c, name: best || label.charAt(0).toUpperCase() + label.slice(1), quiet: now - c.last > YEAR };
  }).sort((a, b) => b.count - a.count);
}

export function filterCompanies(list: Company[], filter: CompanyFilter, q?: string) {
  const query = q?.trim().toLowerCase();
  return list.filter((c) =>
    (filter === "all" || (filter === "security" && c.security) || (filter === "quiet" && c.quiet)
      || (filter === "newsletters" && c.unsubscribable.length > 0))
    && (!query || c.domain.includes(query) || c.name.toLowerCase().includes(query)));
}
