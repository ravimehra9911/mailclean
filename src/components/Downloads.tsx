"use client";

// Attachment downloads run in the background: this tracks them for the whole app (sidebar badge, progress pill)
// and shows the history on the Downloads page.

import { useCallback, useEffect, useState } from "react";
import { api, fmtBytes, fmtNum } from "./api";
import type { Job as DownloadJob } from "@/lib/attachments";
import { IconDownload, IconFolder } from "./Icons";

export type { DownloadJob };

const EVENT = "mailclean:downloads";
/** Tells useDownloads() to refresh now (e.g. a download was just started). */
export const downloadsChanged = () => window.dispatchEvent(new Event(EVENT));

/** Download history, polled while something is downloading. */
export function useDownloads() {
  const [data, setData] = useState<{ root: string; downloads: DownloadJob[] }>({ root: "", downloads: [] });
  const load = useCallback(() => api<typeof data>("/api/attachments/history").then(setData).catch(() => {}), []);
  const running = data.downloads.filter((d) => d.status === "running");

  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running.length, load]);

  return { ...data, running, reload: load };
}

export async function openDownloadFolder(folder: string, toast: (m: string, k?: "ok" | "err") => void) {
  await api("/api/attachments/open", { method: "POST", json: { folder } }).catch((e) => toast((e as Error).message, "err"));
}

const done = (d: DownloadJob) => d.saved + d.existing + d.failed;
const pctOf = (d: DownloadJob) => (d.total ? Math.round((done(d) / d.total) * 100) : 100);
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Small progress card shown on other pages while downloads run. */
export function DownloadsPill({ running, onOpen }: { running: DownloadJob[]; onOpen: () => void }) {
  if (!running.length) return null;
  const total = running.reduce((a, d) => a + d.total, 0);
  const finished = running.reduce((a, d) => a + done(d), 0);
  return (
    <button onClick={onOpen} title="Show downloads"
      className="fixed bottom-20 left-4 z-40 flex w-72 sm:bottom-4 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left text-sm shadow-xl hover:bg-muted md:left-64">
      <IconDownload className="size-5 shrink-0 animate-pulse text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {running.length === 1 ? `Saving from ${running[0].title}` : `${running.length} downloads running`}
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full bg-accent transition-all" style={{ width: `${total ? (finished / total) * 100 : 0}%` }} />
        </span>
      </span>
      <span className="text-xs text-subtle tabular-nums">{fmtNum(finished)}/{fmtNum(total)}</span>
    </button>
  );
}

const STATUS: Record<DownloadJob["status"], { label: string; cls: string }> = {
  running: { label: "Downloading", cls: "bg-accent/15 text-accent" },
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-subtle" },
  interrupted: { label: "Stopped", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

export function DownloadsPage({ root, downloads, reload, demo, toast }: {
  root: string; downloads: DownloadJob[]; reload: () => void; demo: boolean; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const open = (folder: string) => (demo ? toast("Not available in the demo — download MailClean to save attachments.") : openDownloadFolder(folder, toast));

  async function cancel(id: string) {
    setBusy(id);
    await api(`/api/attachments/download?job=${id}`, { method: "DELETE" }).catch((e) => toast((e as Error).message, "err"));
    setBusy(null);
    reload();
  }
  async function clear() {
    if (demo) return toast("Not available in the demo.");
    if (!confirm("Clear the download history? The saved files stay in your Downloads folder.")) return;
    await api("/api/attachments/history", { method: "DELETE" }).catch((e) => toast((e as Error).message, "err"));
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-5 py-4 text-sm">
        <IconFolder className="size-5 shrink-0 text-subtle" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Saved to your Downloads folder</div>
          <div className="truncate font-mono text-xs text-subtle" title={root}>{root}</div>
        </div>
        <button onClick={() => open(root)} className="h-9 rounded-lg border border-line px-3 font-medium hover:bg-muted">Open folder</button>
      </div>

      {downloads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-subtle">
          <IconDownload className="mx-auto mb-3 size-8 opacity-60" />
          No downloads yet. Select senders on <b className="text-ink">Senders</b> and click <b className="text-ink">Attachments</b> to save
          their statements, invoices or photos. Downloads keep running while you use the rest of MailClean.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {downloads.map((d) => (
              <li key={d.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{d.title}</span>
                      <span className={`rounded-full px-2 py-px text-[11px] font-medium ${STATUS[d.status].cls}`}>
                        {d.cancelling ? "Cancelling…" : STATUS[d.status].label}
                      </span>
                      <span className="text-xs text-subtle uppercase">{d.formats.split(",").join(", ")}</span>
                    </div>
                    <div className="mt-1 text-xs text-subtle">
                      {when(d.startedAt)} · {fmtNum(d.saved)} saved{d.bytes > 0 && ` (${fmtBytes(d.bytes)})`}
                      {d.existing > 0 && ` · ${fmtNum(d.existing)} already saved earlier`}
                      {d.failed > 0 && <span className="text-danger"> · {fmtNum(d.failed)} failed</span>}
                      {d.status !== "done" && d.status !== "running" && ` · ${fmtNum(d.total - done(d))} not downloaded`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {d.status === "running" && (
                      <button onClick={() => cancel(d.id)} disabled={busy === d.id || d.cancelling}
                        className="h-8 rounded-lg border border-line px-3 text-sm hover:bg-muted disabled:opacity-50">Cancel</button>
                    )}
                    <button onClick={() => open(d.folder)} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted">
                      <IconFolder className="size-4" /> Open folder
                    </button>
                  </div>
                </div>
                {d.status === "running" && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-accent transition-all" style={{ width: `${pctOf(d)}%` }} />
                    </div>
                    <span className="text-xs text-subtle tabular-nums">{fmtNum(done(d))} / {fmtNum(d.total)}</span>
                  </div>
                )}
                <div className="mt-2 truncate font-mono text-[11px] text-subtle" title={d.folder}>{d.folder}</div>
                {d.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{d.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
              </li>
            ))}
          </ul>
          {downloads.some((d) => d.status !== "running") && (
            <div className="text-right">
              <button onClick={clear} className="text-sm text-subtle hover:text-ink">Clear history</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
