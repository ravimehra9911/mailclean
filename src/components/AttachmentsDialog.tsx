"use client";

// Bulk attachment download for the selected senders: scan → pick formats → download with progress → open folder.
// The download runs on the server, so closing this dialog leaves it running (see the Downloads page).

import { useEffect, useState } from "react";
import { api, fmtBytes, fmtNum } from "./api";
import { downloadsChanged, openDownloadFolder, type DownloadJob as Job } from "./Downloads";

interface Format { ext: string; label: string; count: number; bytes: number }
interface Scan { scanId: string | null; demo?: boolean; emails: number; files: number; skipped: string[]; formats: Format[] }

export function AttachmentsDialog({ senders, names, scope, onClose }: {
  senders: string[];
  /** Display name per sender (domain when it has none), for the title and folder hint. */
  names: Record<string, string>;
  scope: { accountId?: string; from?: number; to?: number; category?: string };
  onClose: () => void;
}) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [demoNote, setDemoNote] = useState(false);

  useEffect(() => {
    api<Scan>("/api/attachments/scan", { method: "POST", json: { senders, ...scope } })
      .then((s) => { setScan(s); setPicked(new Set(s.formats.some((f) => f.ext === "pdf") ? ["pdf"] : [])); })
      .catch((e) => setError((e as Error).message));
  }, [senders, scope]);

  // Poll the download until it finishes.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setTimeout(() => {
      api<Job>(`/api/attachments/download?job=${job.id}`).then((j) => { setJob(j); if (j.status !== "running") downloadsChanged(); })
        .catch((e) => setError((e as Error).message));
    }, 700);
    return () => clearTimeout(t);
  }, [job]);

  const busy = job?.status === "running";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = scan?.formats.filter((f) => picked.has(f.ext)) ?? [];
  const count = chosen.reduce((a, f) => a + f.count, 0);
  const bytes = chosen.reduce((a, f) => a + f.bytes, 0);
  const title = senders.length === 1 ? names[senders[0]] || senders[0] : `${senders.length} senders`;
  const folderHint = senders.length === 1 ? `Downloads/MailClean/${names[senders[0]] || senders[0]}/` : "Downloads/MailClean/<sender>/";

  async function start() {
    if (!scan?.scanId) { setDemoNote(true); return; }
    setStarting(true);
    setError(null);
    try {
      setJob(await api<Job>("/api/attachments/download", { method: "POST", json: { scanId: scan.scanId, formats: [...picked] } }));
      downloadsChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    await api(`/api/attachments/download?job=${job.id}`, { method: "DELETE" }).catch((e) => setError((e as Error).message));
    downloadsChanged();
  }

  const toggle = (ext: string) => setPicked((p) => { const n = new Set(p); if (n.has(ext)) n.delete(ext); else n.add(ext); return n; });
  const handled = job ? job.saved + job.existing + job.failed : 0;
  const pct = job?.total ? Math.round((handled / job.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="att-title" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
        <div className="border-b border-line px-6 py-4">
          <h2 id="att-title" className="text-lg font-semibold">Download attachments</h2>
          <p className="mt-0.5 truncate text-sm text-subtle">From {title}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm">
          {error && <div role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}

          {demoNote && (
            <div className="mb-3 rounded-lg bg-accent/10 px-3 py-2">
              This demo uses sample data, so there are no real files to save. <a href="/download" className="font-medium text-accent hover:underline">Download MailClean</a> to save your own attachments.
            </div>
          )}

          {!scan && !error && <p className="py-8 text-center text-subtle">Looking for attachments… this reads only the email structure, not the files.</p>}

          {scan && !job && (
            <>
              <p className="text-subtle">
                Found <b className="text-ink">{fmtNum(scan.files)}</b> attachment{scan.files === 1 ? "" : "s"} in {fmtNum(scan.emails)} emails.
                {scan.files > 0 && " Choose the formats to save:"}
              </p>
              {scan.formats.length > 0 && (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                  {scan.formats.map((f) => (
                    <li key={f.ext}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted">
                        <input type="checkbox" checked={picked.has(f.ext)} onChange={() => toggle(f.ext)} className="accent-accent" />
                        <span className="flex-1"><b>{f.label}</b> <span className="text-xs text-subtle">.{f.ext}</span></span>
                        <span className="text-xs text-subtle tabular-nums">{fmtNum(f.count)} file{f.count === 1 ? "" : "s"} · {fmtBytes(f.bytes)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {scan.skipped.length > 0 && (
                <p className="mt-3 text-xs text-subtle">Not included: {scan.skipped.join(", ")} (connected with Google sign-in).</p>
              )}
              <p className="mt-3 text-xs text-subtle">
                Saved to <span className="font-mono">{folderHint}</span> as “date sender - file name”. Files come straight from your email
                provider to this computer.
              </p>
            </>
          )}

          {job && (
            <div className="py-2">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{job.cancelling ? "Cancelling…" : busy ? "Downloading…" : job.status === "cancelled" ? "Cancelled" : "Done"}</span>
                <span className="text-xs text-subtle tabular-nums">{fmtNum(handled)} / {fmtNum(job.total)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
              {busy && (
                <p className="mt-3 text-subtle">
                  You can close this and keep using MailClean — the download continues, and you can follow it on the <b className="text-ink">Downloads</b> page.
                </p>
              )}
              {!busy && (
                <p className="mt-3">
                  <b>Saved {fmtNum(job.saved)} file{job.saved === 1 ? "" : "s"}</b>
                  {job.existing > 0 && <span className="text-subtle"> · {fmtNum(job.existing)} already saved earlier, skipped</span>}
                  {job.failed > 0 && <span className="text-danger"> · {fmtNum(job.failed)} couldn&apos;t be saved</span>}
                </p>
              )}
              {job.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{job.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
          {job && !busy ? (
            <>
              <button onClick={() => openDownloadFolder(job.folder, (m) => setError(m))} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Open folder</button>
              <button onClick={onClose} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Done</button>
            </>
          ) : busy ? (
            <>
              <button onClick={cancel} disabled={job.cancelling} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel download</button>
              <button onClick={onClose} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Continue in background</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Cancel</button>
              {!job && (
                <button onClick={start} disabled={!scan || count === 0 || starting}
                  className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {count ? `Download ${fmtNum(count)} file${count === 1 ? "" : "s"} · ${fmtBytes(bytes)}` : "Download"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
