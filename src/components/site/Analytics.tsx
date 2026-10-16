"use client";

// Google Analytics 4 for the public website and web demo only (never the desktop app).
// Loads only after the visitor accepts the cookie banner. Enabled when NEXT_PUBLIC_GA_ID is set.

import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = "mailclean-analytics"; // "granted" | "denied"

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { gtag?: Gtag; dataLayer?: unknown[] }
}

/** Sends a GA event if analytics is loaded; a no-op otherwise. */
export function track(name: string, params: Record<string, string> = {}) {
  window.gtag?.("event", name, params);
}

export function Analytics() {
  const [choice, setChoice] = useState<"granted" | "denied" | null | undefined>(undefined);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      setChoice(v === "granted" || v === "denied" ? v : null);
    } catch {
      setChoice(null);
    }
  }, []);

  // Track clicks on links marked with data-track="event_name" (downloads, demo, GitHub).
  useEffect(() => {
    if (choice !== "granted") return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("[data-track]") as HTMLElement | null;
      if (a) track(a.dataset.track!, { label: a.dataset.trackLabel ?? "", page: location.pathname });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [choice]);

  if (!GA_ID) return null;

  function decide(v: "granted" | "denied") {
    try { localStorage.setItem(KEY, v); } catch { /* not persisted */ }
    setChoice(v);
  }

  return (
    <>
      {choice === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      )}
      {choice === null && (
        <div role="dialog" aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-card/95 px-5 py-4 text-sm shadow-2xl backdrop-blur sm:inset-x-6">
          <p className="min-w-60 flex-1 text-subtle">
            We use Google Analytics cookies to count visits to this website. The MailClean app itself never tracks you.
          </p>
          <div className="flex gap-2">
            <button onClick={() => decide("denied")} className="h-9 rounded-lg border border-line px-3 font-medium hover:bg-muted">Decline</button>
            <button onClick={() => decide("granted")} className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:opacity-90">Accept</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Small link that lets visitors change their analytics choice (shown in the footer). */
export function AnalyticsSettings() {
  if (!GA_ID) return null;
  return (
    <button onClick={() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } location.reload(); }}
      className="hover:text-ink">
      Cookie settings
    </button>
  );
}
