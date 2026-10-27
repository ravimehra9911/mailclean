// Bulk attachment download: find the attachments in the selected senders' emails, let the user pick formats,
// then save them to Downloads/MailClean/<sender>/ as "<date> <sender> - <file name>". Files go straight from the
// email provider to this computer; nothing is stored in the database.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAccount, db } from "./db";
import { imapConfig } from "./accounts";
import { isImapProvider } from "./catalog";
import { imapDownloadAttachments, imapListAttachments, type AttachmentRef } from "./providers/imap";
import { scopeSql, type Scope } from "./stats";

interface Found extends AttachmentRef {
  accountId: string;
  sender: string;
  senderName: string;
  date: number;
  ext: string;
}

export interface Format { ext: string; label: string; count: number; bytes: number }

const LABELS: Record<string, string> = {
  pdf: "PDF", jpg: "JPEG image", jpeg: "JPEG image", png: "PNG image", gif: "GIF image", webp: "WebP image", heic: "HEIC photo",
  doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", csv: "CSV", ppt: "PowerPoint", pptx: "PowerPoint",
  zip: "ZIP archive", rar: "RAR archive", txt: "Text", html: "HTML", htm: "HTML", ics: "Calendar invite", eml: "Email",
  xml: "XML", json: "JSON", mp3: "Audio", mp4: "Video", mov: "Video",
};
const FROM_MIME: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "text/calendar": "ics",
  "text/csv": "csv", "application/zip": "zip", "message/rfc822": "eml", "text/plain": "txt", "text/html": "html",
};

function extOf(filename: string, type: string) {
  const m = filename.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
  return m ? m[1] : FROM_MIME[type] ?? "other";
}
/** Folder/file label for a sender with no display name: its domain, e.g. "icicibank.com". */
export const senderLabel = (email: string) => email.split("@")[1] || email;
export const formatLabel = (ext: string) => LABELS[ext] ?? (ext === "other" ? "Other files" : ext.toUpperCase());

// Scans and download jobs live in memory for this app session only.
const g = globalThis as { __mcScans?: Map<string, { at: number; files: Found[] }>; __mcJobs?: Map<string, Job> };
const scans = (g.__mcScans ??= new Map<string, { at: number; files: Found[] }>());
const jobs = (g.__mcJobs ??= new Map<string, Job>());

/** Finds the attachments in these senders' emails within the scope (account, dates, Gmail tab). */
export async function scanAttachments(senders: string[], scope: Scope) {
  const { conds, args } = scopeSql(scope);
  const rows = db().prepare(`SELECT m.account_id, m.msg_id, m.from_email, m.from_name, m.date FROM messages m
    WHERE m.from_email IN (${senders.map(() => "?").join(",")}) ${conds.map((c) => `AND ${c}`).join(" ")}`)
    .all(...senders, ...args) as { account_id: string; msg_id: string; from_email: string; from_name: string | null; date: number }[];
  const meta = new Map(rows.map((r) => [`${r.account_id}\n${r.msg_id}`, r]));
  const byAccount = new Map<string, string[]>();
  for (const r of rows) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), r.msg_id]);

  const files: Found[] = [];
  const skipped: string[] = [];
  for (const [accountId, ids] of byAccount) {
    const acc = getAccount(accountId);
    if (!acc) continue;
    if (!isImapProvider(acc.provider)) { skipped.push(acc.email); continue; }
    for (const ref of await imapListAttachments(await imapConfig(acc), ids)) {
      const m = meta.get(`${accountId}\n${ref.id}`)!;
      files.push({ ...ref, accountId, sender: m.from_email, senderName: m.from_name || senderLabel(m.from_email), date: m.date, ext: extOf(ref.filename, ref.type) });
    }
  }
  const id = crypto.randomUUID();
  scans.set(id, { at: Date.now(), files });
  for (const [k, v] of scans) if (Date.now() - v.at > 3600_000) scans.delete(k);
  const formats = new Map<string, Format>();
  for (const f of files) {
    const x = formats.get(f.ext) ?? { ext: f.ext, label: formatLabel(f.ext), count: 0, bytes: 0 };
    x.count++; x.bytes += f.size;
    formats.set(f.ext, x);
  }
  return {
    scanId: id, emails: rows.length, files: files.length, skipped,
    formats: [...formats.values()].sort((a, b) => b.count - a.count),
  };
}

export interface Job {
  id: string; title: string; formats: string; folder: string;
  total: number; saved: number; existing: number; failed: number; bytes: number;
  status: "running" | "done" | "cancelled" | "interrupted"; errors: string[]; startedAt: number; finishedAt: number | null;
  /** Cancel was requested; the job stays "running" until the file in progress is finished. */
  cancelling: boolean;
}

export const downloadsRoot = () => path.join(os.homedir(), "Downloads", "MailClean");

// Windows refuses these as file or folder names, with or without an extension ("CON", "nul.txt").
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i;

/** A file or folder name safe on every OS: no separators or control characters, never "." / ".." (which would
 *  leave the folder it is joined to) and never a Windows device name. */
const safe = (s: string) => {
  const name = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name || /^\.+$/.test(name)) return "file";
  return RESERVED.test(name) ? `_${name}` : name;
};
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A path that doesn't exist yet: "name.pdf", then "name (2).pdf", … */
function unique(file: string) {
  if (!fs.existsSync(file)) return file;
  const { dir, name, ext } = path.parse(file);
  for (let i = 2; ; i++) {
    const next = path.join(dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
}

/** Where a file is saved: Downloads/MailClean/<sender>/<date> <sender> - <file name>. */
export function targetOf(f: Pick<Found, "filename" | "senderName" | "date">) {
  const { name, ext } = path.parse(safe(f.filename));
  const root = downloadsRoot();
  const target = path.resolve(root, safe(f.senderName), `${day(f.date)} ${safe(f.senderName)} - ${name}${ext}`);
  if (!target.startsWith(root + path.sep)) throw new Error("Unsafe attachment path");
  return target;
}

const sizeOf = (file: string) => { try { return fs.statSync(file).size; } catch { return -1; } };

// Which attachment (account, email, MIME part) was saved to which file, so a later download skips exactly the
// attachments already on disk — not files that merely share a name.
const sql = {
  part: () => db().prepare("SELECT file, size FROM downloaded_parts WHERE account_id = ? AND msg_id = ? AND part = ?"),
  claimed: () => db().prepare("SELECT 1 FROM downloaded_parts WHERE file = ?"),
  record: () => db().prepare("INSERT OR REPLACE INTO downloaded_parts (account_id, msg_id, part, file, size, at) VALUES (?, ?, ?, ?, ?, ?)"),
  update: () => db().prepare(`UPDATE downloads SET saved = ?, existing = ?, failed = ?, bytes = ?, status = ?, errors = ?, finished_at = ? WHERE id = ?`),
};
const stmts = new Map<keyof typeof sql, ReturnType<ReturnType<typeof db>["prepare"]>>();
const stmt = (k: keyof typeof sql) => { let s = stmts.get(k); if (!s) stmts.set(k, (s = sql[k]())); return s; };

/** True if this attachment is already saved: recorded with the same size, or (from v1.8.0, before records)
 *  a file with its name that no other attachment is recorded for. */
function alreadySaved(f: Found) {
  const rec = stmt("part").get(f.accountId, f.id, f.part) as { file: string; size: number } | undefined;
  if (rec) return sizeOf(rec.file) === rec.size;
  const target = targetOf(f);
  if (!fs.existsSync(target) || stmt("claimed").get(target)) return false;
  stmt("record").run(f.accountId, f.id, f.part, target, sizeOf(target), Date.now());
  return true;
}

interface Row {
  id: string; title: string; formats: string; folder: string; total: number; saved: number; existing: number; failed: number;
  bytes: number; status: Job["status"]; errors: string | null; started_at: number; finished_at: number | null;
}
const fromRow = (r: Row): Job => ({
  id: r.id, title: r.title, formats: r.formats, folder: r.folder, total: r.total, saved: r.saved, existing: r.existing,
  failed: r.failed, bytes: r.bytes, status: r.status, errors: r.errors ? JSON.parse(r.errors) : [], startedAt: r.started_at,
  finishedAt: r.finished_at, cancelling: false,
});

function persist(job: Job) {
  stmt("update").run(job.saved, job.existing, job.failed, job.bytes, job.status, JSON.stringify(job.errors), job.finishedAt, job.id);
}

/** Saves one attachment: streams into "<file>.part" and renames it when complete, so an interrupted download
 *  never leaves a truncated file under the real name. Returns the bytes written. */
async function saveFile(f: Found, content: Readable) {
  const target = targetOf(f);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Another attachment already owns this name (same date and file name) → "name (2).pdf".
  const file = stmt("claimed").get(target) ? unique(target) : target;
  const tmp = `${file}.part`;
  try {
    await pipeline(content, fs.createWriteStream(tmp));
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  const size = sizeOf(file);
  stmt("record").run(f.accountId, f.id, f.part, file, size, Date.now());
  return size;
}

/** Starts saving the chosen formats from a scan in the background; returns the job, which keeps running if the page is closed. */
export function startDownload(scanId: string, exts: string[]): Job | null {
  const scan = scans.get(scanId);
  if (!scan) return null;
  const chosen = scan.files.filter((f) => exts.includes(f.ext));
  const root = downloadsRoot();
  const senders = new Set(chosen.map((f) => f.sender));
  const names = [...new Set(chosen.map((f) => f.senderName))];
  const job: Job = {
    id: crypto.randomUUID(), title: names.length === 1 ? names[0] : `${names.length} senders`, formats: exts.join(","),
    folder: senders.size === 1 && chosen.length ? path.join(root, safe(chosen[0].senderName)) : root,
    total: chosen.length, saved: 0, existing: 0, failed: 0, bytes: 0, status: "running", errors: [],
    startedAt: Date.now(), finishedAt: null, cancelling: false,
  };
  db().prepare(`INSERT INTO downloads (id, title, formats, folder, total, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)`)
    .run(job.id, job.title, job.formats, job.folder, job.total, job.startedAt);
  jobs.set(job.id, job);
  const fail = (msg: string) => { if (job.errors.length < 5) job.errors.push(msg); };
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  (async () => {
    const byAccount = new Map<string, Found[]>();
    for (const f of chosen) byAccount.set(f.accountId, [...(byAccount.get(f.accountId) ?? []), f]);
    for (const [accountId, list] of byAccount) {
      if (job.cancelling) break;
      const before = job.saved + job.existing + job.failed;
      try {
        const acc = getAccount(accountId);
        if (!acc) throw new Error("Account was disconnected");
        await imapDownloadAttachments(await imapConfig(acc), list, async (ref, content) => {
          job.bytes += await saveFile(ref as Found, content);
          job.saved++;
          persist(job);
        }, (ref, e) => {
          job.failed++;
          fail(`${ref.filename}: ${message(e)}`);
          persist(job);
        }, () => job.cancelling, (ref) => {
          if (!alreadySaved(ref as Found)) return false;
          job.existing++;
          persist(job);
          return true;
        });
      } catch (e) {
        // Connection failed part-way: the files not handled yet count as failed.
        job.failed += list.length - (job.saved + job.existing + job.failed - before);
        fail(`${getAccount(accountId)?.email ?? "Account"}: ${message(e)}`);
      }
    }
  })()
    .catch((e) => fail(message(e)))
    .finally(() => {
      job.status = job.cancelling ? "cancelled" : "done";
      job.cancelling = false;
      job.finishedAt = Date.now();
      try { persist(job); } catch { /* the in-memory job still reports the result */ }
    });
  return job;
}

export const getJob = (id: string): Job | null => {
  const live = jobs.get(id);
  if (live) return live;
  const r = db().prepare("SELECT * FROM downloads WHERE id = ?").get(id) as Row | undefined;
  return r ? fromRow(r) : null;
};

/** Asks a running download to stop after the file in progress; files already saved are kept. */
export function cancelDownload(id: string) {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return false;
  job.cancelling = true;
  return true;
}

/** Download history, newest first; running downloads show live progress. */
export function listDownloads(limit = 100): Job[] {
  const rows = db().prepare("SELECT * FROM downloads ORDER BY started_at DESC LIMIT ?").all(limit) as unknown as Row[];
  return rows.map((r) => jobs.get(r.id) ?? fromRow(r));
}

/** Removes finished downloads from the history (the saved files stay on disk). */
export function clearDownloads() {
  db().prepare("DELETE FROM downloads WHERE status != 'running'").run();
  for (const [id, j] of jobs) if (j.status !== "running") jobs.delete(id);
}

/** Opens a folder inside Downloads/MailClean in the system file manager. Only folders — never a file, which
 *  `open`/`explorer` would launch. */
export function openFolder(folder: string) {
  const root = downloadsRoot();
  const resolved = path.resolve(folder);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Not a MailClean download folder");
  if (resolved === root) fs.mkdirSync(root, { recursive: true });
  let isDir = false;
  try { isDir = fs.statSync(resolved).isDirectory(); } catch { throw new Error("This folder was moved or deleted"); }
  if (!isDir) throw new Error("Not a folder");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [resolved], { detached: true, stdio: "ignore" }).unref();
}
