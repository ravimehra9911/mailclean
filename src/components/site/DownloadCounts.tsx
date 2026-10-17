"use client";

// Download counts on the website. The server's numbers are used first; the visitor's browser then
// fetches fresh ones from GitHub (each visitor has their own rate limit) and caches them for an hour.

import { createContext, useContext, useEffect, useState } from "react";
import { countsFromReleases, RELEASES_API, type DownloadCounts, type ReleasesJson } from "@/lib/downloads";

const Ctx = createContext<DownloadCounts | null>(null);
const CACHE_KEY = "mailclean-download-counts";
const CACHE_MS = 60 * 60_000;

export function DownloadCountsProvider({ initial, children }: { initial: DownloadCounts; children: React.ReactNode }) {
  const [counts, setCounts] = useState(initial);

  useEffect(() => {
    const use = (c: DownloadCounts) => setCounts((prev) => (c.total >= prev.total ? c : prev));
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { at: number; counts: DownloadCounts } | null;
      if (cached && Date.now() - cached.at < CACHE_MS) { use(cached.counts); return; }
    } catch { /* no cache */ }
    fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json: ReleasesJson) => {
        const c = countsFromReleases(json);
        use(c);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), counts: c })); } catch { /* not cached */ }
      })
      .catch(() => { /* keep the server's numbers */ });
  }, []);

  return <Ctx.Provider value={counts}>{children}</Ctx.Provider>;
}

export function useDownloadCounts(): DownloadCounts | null {
  return useContext(Ctx);
}

/** " · 22 downloads" for the hero line; nothing until there are downloads. */
export function DownloadTotal() {
  const c = useDownloadCounts();
  if (!c?.total) return null;
  return <> · {c.total.toLocaleString("en-IN")} downloads</>;
}
