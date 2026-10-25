import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmp = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-rules-"));
  process.env.DATA_DIR = dir;
  return { dir };
});

// The provider is never contacted: moveMessages records what it was asked to move.
vi.mock("./accounts", () => ({ moveMessages: vi.fn(async () => {}), startSync: vi.fn() }));

const { moveMessages } = await import("./accounts");
const { db } = await import("./db");
const { addRule, listRules, matching, parseRule, runRules, setRuleEnabled } = await import("./rules");

const NOW = Date.now();
const DAY = 86_400_000;

function addAccount(id: string) {
  db().prepare("INSERT INTO accounts (id, provider, email, created_at) VALUES (?, 'gmail', ?, 0)").run(id, `${id}@example.com`);
}
function add(accountId: string, msgId: string, from: string, o: { days?: number; inbox?: boolean; starred?: boolean; important?: boolean; category?: string } = {}) {
  db().prepare(`INSERT INTO messages (account_id, msg_id, from_email, date, in_inbox, starred, important, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(accountId, msgId, from, NOW - (o.days ?? 0) * DAY, o.inbox === false ? 0 : 1, o.starred ? 1 : 0, o.important ? 1 : 0, o.category ?? null);
}
const moved = () => vi.mocked(moveMessages).mock.calls.map(([a, ids, action]) => [a.id, [...ids].sort(), action]);

beforeEach(() => {
  for (const t of ["messages", "accounts", "rules"]) db().exec(`DELETE FROM ${t}`);
  vi.mocked(moveMessages).mockReset().mockResolvedValue(undefined);
  addAccount("a1");
  addAccount("a2");
});

afterAll(() => fs.rmSync(tmp.dir, { recursive: true, force: true }));

describe("parseRule", () => {
  it("needs exactly one of sender or Gmail tab, and an action", () => {
    expect(parseRule({ sender: " News@X.example ", action: "trash" })).toEqual({ sender: "news@x.example", category: null, older_than_days: 0, action: "trash" });
    expect(parseRule({ category: "promotions", action: "archive", older_than_days: 30 })).toEqual({ sender: null, category: "promotions", older_than_days: 30, action: "archive" });
    expect(parseRule({ action: "trash" })).toBeNull();
    expect(parseRule({ sender: "a@x.example", category: "promotions", action: "trash" })).toBeNull();
    expect(parseRule({ sender: "a@x.example", action: "delete" })).toBeNull();
    expect(parseRule({ sender: "not an email", action: "trash" })).toBeNull();
    expect(parseRule({ category: "spam", action: "trash" })).toBeNull();
  });

  it("rejects invalid ages", () => {
    for (const d of [-1, 1.5, 3651, "x"]) expect(parseRule({ sender: "a@x.example", action: "trash", older_than_days: d })).toBeNull();
  });
});

describe("runRules", () => {
  it("moves a sender's emails, keeping starred and important ones", async () => {
    add("a1", "1", "s@x.example");
    add("a1", "2", "s@x.example", { starred: true });
    add("a1", "3", "s@x.example", { important: true });
    add("a2", "4", "s@x.example");
    add("a1", "5", "other@x.example");
    const id = addRule({ sender: "s@x.example", category: null, older_than_days: 0, action: "trash" });
    expect(await runRules()).toEqual({ count: 2, errors: [] });
    expect(moved()).toEqual([["a1", ["1"], "trash"], ["a2", ["4"], "trash"]]);
    expect(db().prepare("SELECT msg_id FROM messages ORDER BY msg_id").all().map((r) => (r as { msg_id: string }).msg_id)).toEqual(["2", "3", "5"]);
    const rule = db().prepare("SELECT cleaned, last_run_at FROM rules WHERE id = ?").get(id) as { cleaned: number; last_run_at: number };
    expect(rule.cleaned).toBe(2);
    expect(rule.last_run_at).toBeGreaterThan(0);
  });

  it("matches a Gmail tab and only emails older than the rule's age", async () => {
    add("a1", "old", "a@x.example", { category: "promotions", days: 40 });
    add("a1", "new", "b@x.example", { category: "promotions", days: 5 });
    add("a1", "tab", "c@x.example", { category: "updates", days: 40 });
    addRule({ sender: null, category: "promotions", older_than_days: 30, action: "trash" });
    await runRules();
    expect(moved()).toEqual([["a1", ["old"], "trash"]]);
  });

  it("archives only emails still in the inbox", async () => {
    add("a1", "1", "s@x.example");
    add("a1", "2", "s@x.example", { inbox: false });
    addRule({ sender: "s@x.example", category: null, older_than_days: 0, action: "archive" });
    expect((await runRules()).count).toBe(1);
    expect(moved()).toEqual([["a1", ["1"], "archive"]]);
    expect(db().prepare("SELECT SUM(in_inbox) n FROM messages").get()).toEqual({ n: 0 });
  });

  it("runs on one account only when given one", async () => {
    add("a1", "1", "s@x.example");
    add("a2", "2", "s@x.example");
    addRule({ sender: "s@x.example", category: null, older_than_days: 0, action: "trash" });
    await runRules("a2");
    expect(moved()).toEqual([["a2", ["2"], "trash"]]);
  });

  it("skips disabled rules", async () => {
    add("a1", "1", "s@x.example");
    const id = addRule({ sender: "s@x.example", category: null, older_than_days: 0, action: "trash" });
    setRuleEnabled(id, false);
    expect(await runRules()).toEqual({ count: 0, errors: [] });
    expect(moveMessages).not.toHaveBeenCalled();
  });

  it("reports provider errors and leaves the local copies", async () => {
    add("a1", "1", "s@x.example");
    vi.mocked(moveMessages).mockRejectedValue(new Error("offline"));
    addRule({ sender: "s@x.example", category: null, older_than_days: 0, action: "trash" });
    expect(await runRules()).toEqual({ count: 0, errors: ["a1@example.com: offline"] });
    expect(db().prepare("SELECT COUNT(*) n FROM messages").get()).toEqual({ n: 1 });
  });
});

describe("rule bookkeeping", () => {
  it("adding the same rule twice keeps one rule and re-enables it", () => {
    const r = { sender: "s@x.example", category: null, older_than_days: 7, action: "trash" as const };
    const id = addRule(r);
    setRuleEnabled(id, false);
    expect(addRule(r)).toBe(id);
    expect(listRules()).toHaveLength(1);
    expect(listRules()[0].enabled).toBe(1);
  });

  it("counts matching emails the same way it runs them", () => {
    add("a1", "1", "s@x.example", { days: 10 });
    add("a1", "2", "s@x.example", { days: 10, starred: true });
    add("a1", "3", "s@x.example", { days: 1 });
    expect(matching({ sender: "s@x.example", category: null, older_than_days: 5, action: "trash" })).toBe(1);
    expect(matching({ sender: "s@x.example", category: null, older_than_days: 0, action: "trash" }, ["s@x.example"])).toBe(0);
  });
});
