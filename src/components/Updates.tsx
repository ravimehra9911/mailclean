"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface UpdateInfo {
  current?: string;
  latest?: string | null;
  available: boolean;
  downloadUrl?: string | null;
  releaseUrl?: string;
  error?: string;
  demo?: boolean;
}

const SKIP_KEY = "mailclean-skip-update";
const SIX_HOURS = 6 * 60 * 60_000;

/** Checks for a newer release on load and every six hours; `check(true)` forces a fresh check. */
export function useUpdates() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (force = false) => {
    setChecking(true);
    try {
      setInfo(await api<UpdateInfo>(`/api/update${force ? "?force=1" : ""}`));
    } catch (e) {
      setInfo({ available: false, error: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(() => check(), SIX_HOURS);
    return () => clearInterval(t);
  }, [check]);

  return { info, checking, check };
}

const INSTALL_STEPS =
  "Open the downloaded file and install it over the current version (on macOS drag MailClean into Applications and choose Replace). Your accounts and data are kept.";

/** Banner shown when a newer version is available, until the user dismisses that version. */
export function UpdateBanner({ info }: { info: UpdateInfo | null }) {
  const [skipped, setSkipped] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    try { setSkipped(localStorage.getItem(SKIP_KEY)); } catch { /* no storage */ }
  }, []);

  if (!info?.available || !info.latest || skipped === info.latest) return null;

  function later() {
    try { localStorage.setItem(SKIP_KEY, info!.latest!); } catch { /* not persisted */ }
    setSkipped(info!.latest!);
  }

  return (
    <div role="status" className="mb-6 rounded-xl border border-ok/40 bg-ok/10 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          <b>MailClean {info.latest} is available</b> — you have {info.current}.
        </span>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {info.releaseUrl && (
            <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-line bg-card px-3 py-1.5 font-medium hover:bg-muted">What&apos;s new</a>
          )}
          <a href={info.downloadUrl ?? info.releaseUrl} target="_blank" rel="noopener noreferrer" onClick={() => setDownloaded(true)}
            className="rounded-lg bg-ok px-3 py-1.5 font-medium text-white hover:opacity-90">Download update</a>
          <button onClick={later} className="rounded-lg px-2 py-1.5 text-subtle hover:text-ink">Later</button>
        </div>
      </div>
      {downloaded && <p className="mt-2 text-subtle">Downloading in your browser. {INSTALL_STEPS}</p>}
    </div>
  );
}

/** Version line with a "Check for updates" button, for the About page. */
export function UpdateSection({ info, checking, check, version }: {
  info: UpdateInfo | null; checking: boolean; check: (force?: boolean) => void; version: string;
}) {
  if (info?.demo) return null;
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="mb-2 font-semibold">Updates</h2>
      <div className="flex flex-wrap items-center gap-3 text-subtle">
        <span>You have MailClean <b className="text-ink">{version}</b>.</span>
        {info?.available && info.latest ? (
          <a href={info.downloadUrl ?? info.releaseUrl} target="_blank" rel="noopener noreferrer"
            className="rounded-lg bg-ok px-3 py-1.5 font-medium text-white hover:opacity-90">Download {info.latest}</a>
        ) : info?.latest && !info.error ? (
          <span className="text-ok">✓ You&apos;re up to date</span>
        ) : null}
        <button onClick={() => check(true)} disabled={checking}
          className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:bg-muted disabled:opacity-50">
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>
      {info?.error && <p className="mt-2 text-xs text-danger">Couldn&apos;t check for updates: {info.error}</p>}
      {info?.available && <p className="mt-2 text-xs text-subtle">{INSTALL_STEPS}</p>}
      <p className="mt-2 text-xs text-subtle">MailClean checks for new versions when it starts and every six hours.</p>
    </section>
  );
}
