import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmp = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-stats-"));
  process.env.DATA_DIR = dir;
  return { dir };
});

const { db } = await import("./db");
const { overview, scopeFromParams, scopeSql, senders } = await import("./stats");

const NOW = Date.now();

function addAccount(id: string) {
  db().prepare("INSERT INTO accounts (id, provider, email, created_at) VALUES (?, 'gmail', ?, 0)").run(id, `${id}@example.com`);
}
let seq = 0;
/** `n` emails from a sender, the first `unread` of them unread. */
function addMany(from: string, n: number, unread: number, o: { account?: string; http?: string } = {}) {
  for (let i = 0; i < n; i++) {
    db().prepare("INSERT INTO messages (account_id, msg_id, from_email, date, size, unread, unsub_http) VALUES (?, ?, ?, ?, 100, ?, ?)")
      .run(o.account ?? "a1", `m${seq++}`, from, NOW - i * 1000, i < unread ? 1 : 0, o.http ?? null);
  }
}
const emails = (r: { rows: { email: string }[] }) => r.rows.map((x) => x.email).sort();

beforeEach(() => {
  for (const t of ["messages", "accounts", "unsubscribed"]) db().exec(`DELETE FROM ${t}`);
  addAccount("a1");
  addAccount("a2");
});

afterAll(() => fs.rmSync(tmp.dir, { recursive: true, force: true }));

describe("scopeSql", () => {
  it("is empty for an empty scope", () => {
    expect(scopeSql({})).toEqual({ conds: [], args: [] });
  });

  it("builds one condition per field, in order, with the alias", () => {
    expect(scopeSql({ accountId: "a1", from: 10, to: 20, category: "promotions", exclude: ["x@y", "z@y"] }, "k")).toEqual({
      conds: ["k.account_id = ?", "k.date >= ?", "k.date < ?", "k.category = ?", "k.from_email NOT IN (?,?)"],
      args: ["a1", 10, 20, "promotions", "x@y", "z@y"],
    });
  });

  it("keeps a from/to of 0 (epoch) instead of dropping it", () => {
    expect(scopeSql({ from: 0, to: 0 })).toEqual({ conds: ["m.date >= ?", "m.date < ?"], args: [0, 0] });
  });

  it("returns fresh arrays the caller can push to", () => {
    const a = scopeSql({ accountId: "a1" });
    a.conds.push("x");
    expect(scopeSql({ accountId: "a1" }).conds).toEqual(["m.account_id = ?"]);
  });
});

describe("scopeFromParams", () => {
  it("parses account, dates and a known Gmail tab only", () => {
    expect(scopeFromParams(new URLSearchParams("account=a1&from=5&to=9&category=social")))
      .toEqual({ accountId: "a1", from: 5, to: 9, category: "social" });
    expect(scopeFromParams(new URLSearchParams("from=abc&category=spam")))
      .toEqual({ accountId: undefined, from: undefined, to: undefined, category: undefined });
  });
});

describe("senders filters", () => {
  beforeEach(() => {
    addMany("never@x.example", 10, 9); // 90% unread, 10 emails: mostly unread
    addMany("all@x.example", 12, 12);
    addMany("few@x.example", 9, 9); // too few emails
    addMany("read@x.example", 10, 8); // 80% unread
    addMany("news@x.example", 3, 0, { http: "https://x.example/u" });
  });

  it('"Mostly unread" matches senders with 10+ emails and 90%+ unread', () => {
    const r = senders({ filter: "mostly-unread" });
    expect(emails(r)).toEqual(["all@x.example", "never@x.example"]);
    expect(r.total).toBe(2);
  });

  it('"Newsletters" matches senders with an unsubscribe header', () => {
    expect(emails(senders({ filter: "newsletters" }))).toEqual(["news@x.example"]);
  });

  it("agrees with the Overview's mostly-unread count", () => {
    expect(overview({}).mostlyUnreadSenders).toBe(2);
    expect(overview({}).suggestions.neverOpened).toEqual({ senders: 2, count: 22, bytes: 2200 });
  });

  it("applies the scope before grouping", () => {
    addMany("never@x.example", 10, 0, { account: "a2" });
    expect(emails(senders({ filter: "mostly-unread" }))).toEqual(["all@x.example"]);
    expect(emails(senders({ filter: "mostly-unread", accountId: "a1" }))).toEqual(["all@x.example", "never@x.example"]);
  });

  it("searches by address, sorts and pages", () => {
    expect(emails(senders({ q: "news" }))).toEqual(["news@x.example"]);
    const page = senders({ sort: "count", dir: "desc", limit: 2, offset: 0 });
    expect(page.total).toBe(5);
    expect(page.rows.map((r) => [r.email, r.count])).toEqual([["all@x.example", 12], ["never@x.example", 10]]);
    expect(page.rows[0].byAccount).toEqual([{ account_id: "a1", provider: "gmail", email: "a1@example.com", count: 12, bytes: 1200, unread: 12 }]);
  });
});
