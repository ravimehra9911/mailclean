import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmp = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-actions-"));
  process.env.DATA_DIR = dir;
  return { dir };
});

// The provider is never contacted: moveMessages records what it was asked to move.
vi.mock("./accounts", () => ({ moveMessages: vi.fn(async () => {}) }));

const { moveMessages } = await import("./accounts");
const { db } = await import("./db");
const { bulkUnsubscribe, cleanOptions, cleanSenders, unsubscribe, unsubscribePlan } = await import("./actions");

const NOW = Date.now();
const DAY = 86_400_000;

function addAccount(id: string) {
  db().prepare("INSERT INTO accounts (id, provider, email, created_at) VALUES (?, 'gmail', ?, 0)").run(id, `${id}@example.com`);
}
function add(accountId: string, msgId: string, from: string, o: {
  date?: number; inbox?: boolean; starred?: boolean; important?: boolean; category?: string;
  http?: string; mailto?: string; oneClick?: boolean;
} = {}) {
  db().prepare(`INSERT INTO messages (account_id, msg_id, from_email, date, in_inbox, starred, important, category, unsub_http, unsub_mailto, one_click)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(accountId, msgId, from, o.date ?? NOW, o.inbox === false ? 0 : 1,
    o.starred ? 1 : 0, o.important ? 1 : 0, o.category ?? null, o.http ?? null, o.mailto ?? null, o.oneClick ? 1 : 0);
}
/** Ids passed to the provider per account, sorted. */
const moved = () => vi.mocked(moveMessages).mock.calls.map(([a, ids, action]) => [a.id, [...ids].sort(), action]);
const left = () => (db().prepare("SELECT msg_id, in_inbox FROM messages ORDER BY msg_id").all() as { msg_id: string; in_inbox: number }[]);

beforeEach(() => {
  for (const t of ["messages", "accounts", "unsubscribed"]) db().exec(`DELETE FROM ${t}`);
  vi.mocked(moveMessages).mockReset().mockResolvedValue(undefined);
  vi.unstubAllGlobals();
  addAccount("a1");
  addAccount("a2");
});

afterAll(() => fs.rmSync(tmp.dir, { recursive: true, force: true }));

describe("cleanOptions", () => {
  it("accepts only true for keepFlagged and 1–1000 for keepNewest", () => {
    expect(cleanOptions({ keepFlagged: true, keepNewest: 5 })).toEqual({ keepFlagged: true, keepNewest: 5 });
    expect(cleanOptions({ keepFlagged: "yes", keepNewest: "3" })).toEqual({ keepFlagged: false, keepNewest: 3 });
    for (const n of [0, -1, 1.5, 1001, "x", null]) expect(cleanOptions({ keepNewest: n }).keepNewest).toBe(0);
  });
});

describe("cleanSenders", () => {
  it("trashes every email from the senders, per account, and deletes the local copies", async () => {
    add("a1", "1", "s@x.example");
    add("a1", "2", "s@x.example");
    add("a2", "3", "s@x.example");
    add("a1", "4", "keep@x.example");
    const r = await cleanSenders(["s@x.example"], "trash");
    expect(r).toEqual({ count: 3, errors: [] });
    expect(moved()).toEqual([["a1", ["1", "2"], "trash"], ["a2", ["3"], "trash"]]);
    expect(left()).toEqual([{ msg_id: "4", in_inbox: 1 }]);
  });

  it("archives only emails still in the inbox and keeps the local copies", async () => {
    add("a1", "1", "s@x.example");
    add("a1", "2", "s@x.example", { inbox: false });
    const r = await cleanSenders(["s@x.example"], "archive");
    expect(r.count).toBe(1);
    expect(moved()).toEqual([["a1", ["1"], "archive"]]);
    expect(left()).toEqual([{ msg_id: "1", in_inbox: 0 }, { msg_id: "2", in_inbox: 0 }]);
  });

  it("keeps starred and important emails when asked", async () => {
    add("a1", "1", "s@x.example", { starred: true });
    add("a1", "2", "s@x.example", { important: true });
    add("a1", "3", "s@x.example");
    await cleanSenders(["s@x.example"], "trash", {}, { keepFlagged: true });
    expect(moved()).toEqual([["a1", ["3"], "trash"]]);
    vi.mocked(moveMessages).mockClear();
    await cleanSenders(["s@x.example"], "trash");
    expect(moved()).toEqual([["a1", ["1", "2"], "trash"]]);
  });

  it("keeps the newest N emails of each sender", async () => {
    for (let i = 1; i <= 4; i++) add("a1", `s${i}`, "s@x.example", { date: NOW - i * DAY });
    for (let i = 1; i <= 2; i++) add("a2", `t${i}`, "t@x.example", { date: NOW - i * DAY });
    await cleanSenders(["s@x.example", "t@x.example"], "trash", {}, { keepNewest: 2 });
    expect(moved()).toEqual([["a1", ["s3", "s4"], "trash"]]);
  });

  it("counts the newest N within the scope only", async () => {
    // Newest overall is in a2; within account a1 the newest is m2, so only m3 goes.
    add("a2", "m1", "s@x.example", { date: NOW });
    add("a1", "m2", "s@x.example", { date: NOW - DAY });
    add("a1", "m3", "s@x.example", { date: NOW - 2 * DAY });
    await cleanSenders(["s@x.example"], "trash", { accountId: "a1" }, { keepNewest: 1 });
    expect(moved()).toEqual([["a1", ["m3"], "trash"]]);
  });

  it("combines keep-flagged and keep-newest", async () => {
    add("a1", "1", "s@x.example", { date: NOW, starred: true });
    add("a1", "2", "s@x.example", { date: NOW - DAY });
    add("a1", "3", "s@x.example", { date: NOW - 2 * DAY });
    await cleanSenders(["s@x.example"], "trash", {}, { keepFlagged: true, keepNewest: 1 });
    // The starred email is the newest, so it is the one kept by keep-newest too; 2 and 3 go.
    expect(moved()).toEqual([["a1", ["2", "3"], "trash"]]);
  });

  it("limits to the scope: account, dates and Gmail tab", async () => {
    add("a1", "in", "s@x.example", { date: NOW - 10 * DAY, category: "promotions" });
    add("a1", "old", "s@x.example", { date: NOW - 100 * DAY, category: "promotions" });
    add("a1", "tab", "s@x.example", { date: NOW - 10 * DAY, category: "updates" });
    add("a2", "acc", "s@x.example", { date: NOW - 10 * DAY, category: "promotions" });
    await cleanSenders(["s@x.example"], "trash", { accountId: "a1", from: NOW - 30 * DAY, to: NOW, category: "promotions" });
    expect(moved()).toEqual([["a1", ["in"], "trash"]]);
  });

  it("reports a provider error and leaves that account's local copies alone", async () => {
    add("a1", "1", "s@x.example");
    add("a2", "2", "s@x.example");
    vi.mocked(moveMessages).mockImplementation(async (a) => { if (a.id === "a1") throw new Error("auth failed"); });
    const r = await cleanSenders(["s@x.example"], "trash");
    expect(r).toEqual({ count: 1, errors: ["a1@example.com: auth failed"] });
    expect(left().map((m) => m.msg_id)).toEqual(["1"]);
  });

  it("does nothing without senders", async () => {
    add("a1", "1", "s@x.example");
    expect(await cleanSenders([], "trash")).toEqual({ count: 0, errors: [] });
    expect(moveMessages).not.toHaveBeenCalled();
  });
});

describe("unsubscribe", () => {
  const ok = () => vi.fn(async () => new Response(null, { status: 200 }));

  it("does a one-click POST to a public https address and marks the sender", async () => {
    const fetch = ok();
    vi.stubGlobal("fetch", fetch);
    add("a1", "1", "s@x.example", { http: "https://93.184.216.34/u?id=1", oneClick: true });
    expect(await unsubscribe("s@x.example")).toEqual({ status: "done" });
    expect(fetch).toHaveBeenCalledWith("https://93.184.216.34/u?id=1", expect.objectContaining({ method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(db().prepare("SELECT method FROM unsubscribed WHERE from_email = 's@x.example'").get()).toEqual({ method: "one-click" });
  });

  it("never POSTs to private addresses or plain http; hands the link to the browser instead", async () => {
    const fetch = ok();
    vi.stubGlobal("fetch", fetch);
    for (const [i, url] of ["https://127.0.0.1/u", "https://192.168.1.1/u", "https://10.0.0.5/u", "http://93.184.216.34/u"].entries()) {
      add("a1", `${i}`, `s${i}@x.example`, { http: url, oneClick: true });
      expect(await unsubscribe(`s${i}@x.example`)).toEqual({ status: "open", url });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the link when the one-click request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    add("a1", "1", "s@x.example", { http: "https://93.184.216.34/u", oneClick: true });
    expect(await unsubscribe("s@x.example")).toEqual({ status: "open", url: "https://93.184.216.34/u" });
    expect(db().prepare("SELECT method FROM unsubscribed").get()).toEqual({ method: "link" });
  });

  it("uses mailto when there is no link, and none without either", async () => {
    add("a1", "1", "s@x.example", { mailto: "mailto:unsub@x.example" });
    expect(await unsubscribe("s@x.example")).toEqual({ status: "open", url: "mailto:unsub@x.example" });
    add("a1", "2", "n@x.example");
    expect(await unsubscribe("n@x.example")).toEqual({ status: "none" });
  });
});

describe("bulk unsubscribe", () => {
  it("plans each sender's method and skips ones already unsubscribed", async () => {
    add("a1", "1", "one@x.example", { http: "https://93.184.216.34/u", oneClick: true });
    add("a1", "2", "link@x.example", { http: "https://x.example/u" });
    add("a1", "3", "mail@x.example", { mailto: "mailto:u@x.example" });
    add("a1", "4", "none@x.example");
    add("a1", "5", "done@x.example", { http: "https://x.example/u" });
    db().prepare("INSERT INTO unsubscribed (from_email, method, at) VALUES ('done@x.example', 'link', 0)").run();
    const plan = unsubscribePlan(["one@x.example", "link@x.example", "mail@x.example", "none@x.example", "done@x.example"]);
    expect(plan.map((p) => [p.sender, p.method, p.already])).toEqual([
      ["one@x.example", "one-click", false], ["link@x.example", "link", false], ["mail@x.example", "mailto", false],
      ["none@x.example", "none", false], ["done@x.example", "link", true],
    ]);

    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const r = await bulkUnsubscribe(plan.map((p) => p.sender));
    expect(r.results).toEqual([{ sender: "one@x.example", status: "done" }]);
    expect(r.links).toEqual([
      { sender: "link@x.example", url: "https://x.example/u" },
      { sender: "mail@x.example", url: "mailto:u@x.example" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("offers the page for a one-click sender whose request failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    add("a1", "1", "one@x.example", { http: "https://93.184.216.34/u", oneClick: true });
    const r = await bulkUnsubscribe(["one@x.example"]);
    expect(r).toEqual({ results: [{ sender: "one@x.example", status: "failed" }], links: [{ sender: "one@x.example", url: "https://93.184.216.34/u" }] });
  });
});
