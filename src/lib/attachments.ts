// Bulk attachment download: find the attachments in the selected senders' emails, let the user pick formats,
// then save them to Downloads/MailClean/<sender>/ as "<date> <sender> - <file name>". Files go straight from the
// email provider to this computer; nothing is stored in the database.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

export interface Job { id: string; total: number; saved: number; failed: number; done: boolean; folder: string; errors: string[] }

export const downloadsRoot = () => path.join(os.homedir(), "Downloads", "MailClean");

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
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

/** Starts saving the chosen formats from a scan; returns a job to poll for progress. */
export function startDownload(scanId: string, exts: string[]): Job | null {
  const scan = scans.get(scanId);
  if (!scan) return null;
  const chosen = scan.files.filter((f) => exts.includes(f.ext));
  const root = downloadsRoot();
  const job: Job = { id: crypto.randomUUID(), total: chosen.length, saved: 0, failed: 0, done: false, folder: root, errors: [] };
  jobs.set(job.id, job);
  const senders = new Set(chosen.map((f) => f.sender));
  if (senders.size === 1) job.folder = path.join(root, safe(chosen[0].senderName));

  (async () => {
    const byAccount = new Map<string, Found[]>();
    for (const f of chosen) byAccount.set(f.accountId, [...(byAccount.get(f.accountId) ?? []), f]);
    for (const [accountId, list] of byAccount) {
      const acc = getAccount(accountId);
      if (!acc) { job.failed += list.length; continue; }
      const before = job.saved + job.failed;
      try {
        await imapDownloadAttachments(await imapConfig(acc), list, async (ref, content) => {
          const f = ref as Found;
          const dir = path.join(root, safe(f.senderName));
          fs.mkdirSync(dir, { recursive: true });
          const { name, ext } = path.parse(safe(f.filename));
          await pipeline(content, fs.createWriteStream(unique(path.join(dir, `${day(f.date)} ${safe(f.senderName)} - ${name}${ext}`))));
          job.saved++;
        }, (ref, e) => {
          job.failed++;
          if (job.errors.length < 5) job.errors.push(`${ref.filename}: ${e instanceof Error ? e.message : String(e)}`);
        });
      } catch (e) {
        // Connection failed part-way: the files not handled yet count as failed.
        job.failed += list.length - (job.saved + job.failed - before);
        job.errors.push(`${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    job.done = true;
  })();
  return job;
}

export const getJob = (id: string) => jobs.get(id) ?? null;

/** Opens a folder inside Downloads/MailClean in the system file manager. */
export function openFolder(folder: string) {
  const resolved = path.resolve(folder);
  if (!resolved.startsWith(downloadsRoot())) throw new Error("Not a MailClean download folder");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [resolved], { detached: true, stdio: "ignore" }).unref();
}
