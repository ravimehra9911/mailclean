import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRef } from "./providers/imap";

// A temp DATA_DIR before ./db is loaded, and a temp home folder so Downloads/MailClean is never the real one.
const tmp = await vi.hoisted(async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-attachments-"));
  process.env.DATA_DIR = path.join(dir, "data");
  return { dir, home: path.join(dir, "home") };
});

// No mailbox is contacted: the IMAP functions are fakes driven by each test.
const imap = vi.hoisted(() => ({
  list: [] as AttachmentRef[],
  /** File content per "<msg id>/<part>"; an Error makes the stream fail part-way. */
  content: new Map<string, string | Error>(),
  /** Called before each file is saved. */
  beforeSave: (_ref: AttachmentRef) => {},
  downloaded: [] as string[],
}));
vi.mock("./providers/imap", () => ({
  imapListAttachments: vi.fn(async (_cfg: unknown, ids: string[]) => imap.list.filter((r) => ids.includes(r.id))),
  // Same loop as the real one: stop check, skip check, then save (errors go to onError).
  imapDownloadAttachments: vi.fn(async (_cfg: unknown, refs: AttachmentRef[],
    save: (r: AttachmentRef, c: Readable) => Promise<void>, onError: (r: AttachmentRef, e: unknown) => void,
    stopped: () => boolean = () => false, skip: (r: AttachmentRef) => boolean = () => false) => {
    for (const r of refs) {
      if (stopped()) return;
      if (skip(r)) continue;
      try {
        imap.downloaded.push(`${r.id}/${r.part}`);
        imap.beforeSave(r);
        await save(r, stream(imap.content.get(`${r.id}/${r.part}`) ?? "data"));
      } catch (e) {
        onError(r, e);
      }
    }
  }),
}));
vi.mock("./accounts", () => ({ imapConfig: () => ({}) }));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref() {} })) }));
vi.mock("./db", async (orig) => {
  const real = await orig<typeof import("./db")>();
  return { ...real, getAccount: vi.fn(real.getAccount) };
});

function stream(c: string | Error) {
  if (typeof c === "string") return Readable.from([Buffer.from(c)]);
  return new Readable({
    read() {
      this.push(Buffer.from("partial"));
      setImmediate(() => this.destroy(c));
    },
  });
}

const { spawn } = await import("node:child_process");
const dbm = await import("./db");
const { db } = dbm;
const att = await import("./attachments");

const DAY = Date.UTC(2026, 2, 14);
const root = () => path.join(tmp.home, "Downloads", "MailClean");

function addAccount(id: string, provider = "gmail") {
  db().prepare("INSERT INTO accounts (id, provider, email, refresh_token, created_at) VALUES (?, ?, ?, 'x', 0)")
    .run(id, provider, `${id}@example.com`);
}
function addMessage(accountId: string, msgId: string, from: string, name: string | null = "Acme Bank", date = DAY) {
  db().prepare("INSERT INTO messages (account_id, msg_id, from_email, from_name, date) VALUES (?, ?, ?, ?, ?)")
    .run(accountId, msgId, from, name, date);
}
const ref = (id: string, part: string, filename: string, size = 10, type = "application/pdf"): AttachmentRef =>
  ({ id, part, filename, type, size });

async function finished(id: string) {
  await vi.waitFor(() => expect(att.getJob(id)?.status).not.toBe("running"));
  return att.getJob(id)!;
}
async function download(formats = ["pdf"]) {
  const scan = await att.scanAttachments(["bills@acme.example"], {});
  const job = att.startDownload(scan.scanId, formats)!;
  return finished(job.id);
}
const savedFiles = () => (fs.existsSync(path.join(root(), "Acme Bank")) ? fs.readdirSync(path.join(root(), "Acme Bank")).sort() : []);

beforeEach(() => {
  vi.spyOn(os, "homedir").mockReturnValue(tmp.home);
  fs.rmSync(tmp.home, { recursive: true, force: true });
  for (const t of ["messages", "accounts", "downloads", "downloaded_parts"]) db().exec(`DELETE FROM ${t}`);
  imap.list = [];
  imap.content.clear();
  imap.beforeSave = () => {};
  imap.downloaded = [];
  vi.mocked(dbm.getAccount).mockImplementation((id) =>
    db().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as ReturnType<typeof dbm.getAccount>);
  vi.mocked(spawn).mockClear();
  addAccount("a1");
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp.dir, { recursive: true, force: true });
});

describe("scanAttachments", () => {
  it("groups files by format, most common first, with counts and sizes", async () => {
    addMessage("a1", "INBOX:1", "bills@acme.example");
    addMessage("a1", "INBOX:2", "bills@acme.example");
    addMessage("a1", "INBOX:3", "other@else.example");
    imap.list = [
      ref("INBOX:1", "2", "March.PDF", 100),
      ref("INBOX:1", "3", "logo.png", 5, "image/png"),
      ref("INBOX:2", "2", "April.pdf", 200),
      ref("INBOX:2", "3", "statement", 7, "application/pdf"), // no extension: from the MIME type
      ref("INBOX:2", "4", "blob", 1, "application/x-unknown"),
      ref("INBOX:3", "2", "not-selected.pdf", 999),
    ];
    const scan = await att.scanAttachments(["bills@acme.example"], {});
    expect(scan.emails).toBe(2);
    expect(scan.files).toBe(5);
    expect(scan.formats).toEqual([
      { ext: "pdf", label: "PDF", count: 3, bytes: 307 },
      { ext: "png", label: "PNG image", count: 1, bytes: 5 },
      { ext: "other", label: "Other files", count: 1, bytes: 1 },
    ]);
  });

  it("applies the scope and skips accounts that are not IMAP", async () => {
    addAccount("g1", "google");
    addMessage("a1", "INBOX:1", "bills@acme.example", "Acme Bank", DAY);
    addMessage("a1", "INBOX:2", "bills@acme.example", "Acme Bank", DAY - 86_400_000 * 400);
    addMessage("g1", "gm1", "bills@acme.example");
    imap.list = [ref("INBOX:1", "2", "new.pdf"), ref("INBOX:2", "2", "old.pdf")];
    const scan = await att.scanAttachments(["bills@acme.example"], { from: DAY - 86_400_000 });
    expect(scan.skipped).toEqual(["g1@example.com"]);
    expect(scan.files).toBe(1);
  });
});

describe("startDownload", () => {
  beforeEach(() => addMessage("a1", "INBOX:1", "bills@acme.example"));

  it("saves to Downloads/MailClean/<sender>/<date> <sender> - <name> and records each part", async () => {
    imap.list = [ref("INBOX:1", "2", "March.pdf"), ref("INBOX:1", "3", "logo.png", 5, "image/png")];
    imap.content.set("INBOX:1/2", "PDFDATA");
    const job = await download(["pdf"]);
    expect(job).toMatchObject({ status: "done", total: 1, saved: 1, existing: 0, failed: 0, bytes: 7 });
    expect(job.folder).toBe(path.join(root(), "Acme Bank"));
    expect(savedFiles()).toEqual(["2026-03-14 Acme Bank - March.pdf"]);
    expect(fs.readFileSync(path.join(root(), "Acme Bank", "2026-03-14 Acme Bank - March.pdf"), "utf8")).toBe("PDFDATA");
    const parts = db().prepare("SELECT account_id, msg_id, part, size FROM downloaded_parts").all();
    expect(parts).toEqual([{ account_id: "a1", msg_id: "INBOX:1", part: "2", size: 7 }]);
  });

  it("skips attachments already saved, without downloading them again", async () => {
    imap.list = [ref("INBOX:1", "2", "March.pdf")];
    await download();
    imap.downloaded = [];
    const again = await download();
    expect(again).toMatchObject({ status: "done", saved: 0, existing: 1, failed: 0 });
    expect(imap.downloaded).toEqual([]);
    expect(savedFiles()).toEqual(["2026-03-14 Acme Bank - March.pdf"]);
  });

  it("downloads again when the saved file was changed or removed", async () => {
    imap.list = [ref("INBOX:1", "2", "March.pdf")];
    await download();
    fs.rmSync(path.join(root(), "Acme Bank", "2026-03-14 Acme Bank - March.pdf"));
    const again = await download();
    expect(again).toMatchObject({ saved: 1, existing: 0 });
  });

  it("adopts a file saved before records existed (v1.8.0) when no other attachment claims it", async () => {
    const legacy = path.join(root(), "Acme Bank", "2026-03-14 Acme Bank - March.pdf");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "OLD");
    imap.list = [ref("INBOX:1", "2", "March.pdf")];
    const job = await download();
    expect(job).toMatchObject({ saved: 0, existing: 1 });
    expect(imap.downloaded).toEqual([]);
    expect(db().prepare("SELECT file, size FROM downloaded_parts WHERE msg_id = 'INBOX:1'").get()).toEqual({ file: legacy, size: 3 });
  });

  it("does not adopt a file with the same name that another attachment owns", async () => {
    const owned = path.join(root(), "Acme Bank", "2026-03-14 Acme Bank - March.pdf");
    fs.mkdirSync(path.dirname(owned), { recursive: true });
    fs.writeFileSync(owned, "OTHER");
    db().prepare("INSERT INTO downloaded_parts (account_id, msg_id, part, file, size, at) VALUES ('a1', 'INBOX:9', '2', ?, 5, 0)").run(owned);
    imap.list = [ref("INBOX:1", "2", "March.pdf")];
    const job = await download();
    expect(job).toMatchObject({ saved: 1, existing: 0 });
    expect(savedFiles()).toEqual(["2026-03-14 Acme Bank - March (2).pdf", "2026-03-14 Acme Bank - March.pdf"]);
    expect(fs.readFileSync(owned, "utf8")).toBe("OTHER");
  });

  it('saves a second attachment with the same name as "name (2).pdf"', async () => {
    addMessage("a1", "INBOX:2", "bills@acme.example");
    imap.list = [ref("INBOX:1", "2", "invoice.pdf"), ref("INBOX:2", "2", "invoice.pdf")];
    imap.content.set("INBOX:1/2", "ONE");
    imap.content.set("INBOX:2/2", "TWO");
    const job = await download();
    expect(job).toMatchObject({ saved: 2, existing: 0 });
    const dir = path.join(root(), "Acme Bank");
    expect(fs.readFileSync(path.join(dir, "2026-03-14 Acme Bank - invoice.pdf"), "utf8")).toBe("ONE");
    expect(fs.readFileSync(path.join(dir, "2026-03-14 Acme Bank - invoice (2).pdf"), "utf8")).toBe("TWO");
  });

  it("removes the .part file and leaves no file when the stream fails", async () => {
    addMessage("a1", "INBOX:2", "bills@acme.example");
    imap.list = [ref("INBOX:1", "2", "broken.pdf"), ref("INBOX:2", "2", "fine.pdf")];
    imap.content.set("INBOX:1/2", new Error("connection reset"));
    const job = await download();
    expect(job).toMatchObject({ status: "done", saved: 1, failed: 1 });
    expect(job.errors).toEqual(["broken.pdf: connection reset"]);
    expect(savedFiles()).toEqual(["2026-03-14 Acme Bank - fine.pdf"]);
    expect(db().prepare("SELECT COUNT(*) n FROM downloaded_parts").get()).toEqual({ n: 1 });
  });

  it("finishes the file in progress when cancelled, then stops with status cancelled", async () => {
    for (const n of [2, 3]) addMessage("a1", `INBOX:${n}`, "bills@acme.example");
    imap.list = [ref("INBOX:1", "2", "a.pdf"), ref("INBOX:2", "2", "b.pdf"), ref("INBOX:3", "2", "c.pdf")];
    imap.content.set("INBOX:1/2", "COMPLETE");
    const scan = await att.scanAttachments(["bills@acme.example"], {});
    let jobId = "";
    imap.beforeSave = (r) => {
      if (r.id === "INBOX:1") expect(att.cancelDownload(jobId)).toBe(true);
    };
    jobId = att.startDownload(scan.scanId, ["pdf"])!.id;
    const job = await finished(jobId);
    expect(job).toMatchObject({ status: "cancelled", saved: 1, total: 3, cancelling: false });
    expect(imap.downloaded).toEqual(["INBOX:1/2"]);
    expect(fs.readFileSync(path.join(root(), "Acme Bank", "2026-03-14 Acme Bank - a.pdf"), "utf8")).toBe("COMPLETE");
    expect(db().prepare("SELECT status FROM downloads WHERE id = ?").get(jobId)).toEqual({ status: "cancelled" });
    expect(att.cancelDownload(jobId)).toBe(false);
  });

  it("leaves running even when getAccount throws", async () => {
    imap.list = [ref("INBOX:1", "2", "a.pdf")];
    const scan = await att.scanAttachments(["bills@acme.example"], {});
    vi.mocked(dbm.getAccount).mockImplementation(() => { throw new Error("database is locked"); });
    const job = await finished(att.startDownload(scan.scanId, ["pdf"])!.id);
    expect(job.status).toBe("done");
    expect(job.finishedAt).not.toBeNull();
    expect(job.errors.join()).toContain("database is locked");
  });

  it("counts the files of a disconnected account as failed", async () => {
    imap.list = [ref("INBOX:1", "2", "a.pdf")];
    const scan = await att.scanAttachments(["bills@acme.example"], {});
    db().exec("DELETE FROM accounts");
    const job = await finished(att.startDownload(scan.scanId, ["pdf"])!.id);
    expect(job).toMatchObject({ status: "done", failed: 1, saved: 0 });
    expect(job.errors).toEqual(["Account: Account was disconnected"]);
  });

  it("returns null for an unknown scan", () => {
    expect(att.startDownload("nope", ["pdf"])).toBeNull();
  });
});

describe("openFolder", () => {
  it("opens the MailClean folder and folders inside it", () => {
    att.openFolder(root());
    fs.mkdirSync(path.join(root(), "Acme Bank"), { recursive: true });
    att.openFolder(path.join(root(), "Acme Bank"));
    expect(vi.mocked(spawn).mock.calls.map((c) => c[1])).toEqual([[root()], [path.join(root(), "Acme Bank")]]);
  });

  it("rejects files", () => {
    const file = path.join(root(), "Acme Bank", "x.pdf");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
    expect(() => att.openFolder(file)).toThrow("Not a folder");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects paths outside Downloads/MailClean, sibling prefixes and ..", () => {
    const evil = path.join(tmp.home, "Downloads", "MailCleanEvil");
    fs.mkdirSync(evil, { recursive: true });
    // Raw strings: path.join would already collapse the "..".
    const up = [`${root()}${path.sep}..`, `${root()}${path.sep}..${path.sep}MailCleanEvil`, [root(), "Acme Bank", "..", "..", ".."].join(path.sep)];
    fs.mkdirSync(path.join(root(), "Acme Bank"), { recursive: true });
    for (const p of [tmp.home, path.join(tmp.home, "Downloads"), evil, ...up]) {
      expect(() => att.openFolder(p), p).toThrow("Not a MailClean download folder");
    }
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects a folder that no longer exists", () => {
    expect(() => att.openFolder(path.join(root(), "Gone"))).toThrow("moved or deleted");
  });
});
