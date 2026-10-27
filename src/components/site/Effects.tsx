"use client";

// Small interactive pieces for the landing page. All motion is disabled by CSS when the visitor
// prefers reduced motion (see globals.css).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { confetti, ThankYou } from "./Celebrate";
import { useDownloadCounts } from "./DownloadCounts";
import type { InstallerKey } from "@/lib/downloads";

/** Fades and slides its children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? "reveal-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Thin bar at the top of the page showing how far the visitor has scrolled. */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div aria-hidden className="brand-bar fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent" style={{ transform: `scaleX(${p})` }} />;
}

/** Tilts its content in 3D toward the mouse pointer. */
export function Tilt({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function move(e: React.MouseEvent) {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1400px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
  }
  function leave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <div onMouseMove={move} onMouseLeave={leave} className={className}>
      <div ref={ref} className="tilt">{children}</div>
    </div>
  );
}

/** Grid whose cards show a soft spotlight that follows the cursor. */
export function SpotlightGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  function move(e: React.MouseEvent<HTMLDivElement>) {
    for (const card of e.currentTarget.querySelectorAll<HTMLElement>(".spot")) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--x", `${e.clientX - r.left}px`);
      card.style.setProperty("--y", `${e.clientY - r.top}px`);
    }
  }
  return <div onMouseMove={move} className={className}>{children}</div>;
}

/** Counts up from 0 to `to` when scrolled into view. */
export function CountUp({ to, suffix = "", duration = 1200 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / duration);
        setN(Math.round(to * (1 - (1 - k) ** 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref} className="tabular-nums">{n.toLocaleString("en-IN")}{suffix}</span>;
}

// Fictional senders for the interactive mini demo.
const DEMO_ROWS = [
  { name: "ShopKart Deals", count: 1240, junk: true },
  { name: "Daily Tech Digest", count: 980, junk: true },
  { name: "Priya Sharma", count: 214, junk: false },
  { name: "FoodDash", count: 860, junk: true },
  { name: "Northwind Bank", count: 156, junk: false },
  { name: "Q&A Weekly", count: 1105, junk: true },
];

/** Tiny interactive version of the app: click "Clean up" and the junk senders slide away. */
export function CleanupDemo() {
  const [cleaned, setCleaned] = useState(false);
  const [counter, setCounter] = useState(0);
  const target = DEMO_ROWS.filter((r) => r.junk).reduce((a, r) => a + r.count, 0);

  useEffect(() => {
    if (!cleaned) { setCounter(0); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setCounter(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cleaned, target]);

  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-subtle">Emails cleared</div>
          <div className="text-3xl font-semibold tabular-nums text-accent">{counter.toLocaleString("en-IN")}</div>
        </div>
        <button onClick={() => setCleaned((c) => !c)}
          className={`h-10 rounded-lg px-4 text-sm font-medium transition ${cleaned ? "border border-line hover:bg-muted" : "bg-danger text-white hover:opacity-90"}`}>
          {cleaned ? "↺ Reset" : "🧹 Clean up junk"}
        </button>
      </div>
      <ul className="space-y-2">
        {DEMO_ROWS.map((r, i) => {
          const gone = cleaned && r.junk;
          return (
            <li key={r.name}
              className={`demo-row flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm ${gone ? "demo-row-gone" : ""}`}
              style={{ transitionDelay: `${gone ? i * 70 : 0}ms` }}>
              <span className={`grid size-7 place-items-center rounded-md text-xs font-semibold ${r.junk ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
                {r.name[0]}
              </span>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="tabular-nums text-subtle">{r.count.toLocaleString("en-IN")}</span>
              {r.junk && <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">junk</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-subtle">
        {cleaned ? "Your real mail would go to Trash — restorable for 30 days." : "Try it: clear 4 newsletter senders in one click."}
      </p>
    </div>
  );
}

type Platform = "mac" | "windows" | "linux";

/** The visitor's platform, plus the Mac chip type where the browser reveals it (Chrome/Edge). */
export function useDetectedOs(): { os: Platform | null; macArch: "arm" | "x86" | null } {
  const [res, setRes] = useState<{ os: Platform | null; macArch: "arm" | "x86" | null }>({ os: null, macArch: null });
  useEffect(() => {
    const ua = navigator.userAgent;
    const os: Platform | null = /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "mac"
      : /Windows/i.test(ua) ? "windows" : /Linux/i.test(ua) && !/Android/i.test(ua) ? "linux" : null;
    setRes({ os, macArch: null });
    const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> } }).userAgentData;
    if (os === "mac" && uad) {
      uad.getHighEntropyValues(["architecture"]).then((v) => {
        if (v.architecture === "arm" || v.architecture === "x86") setRes({ os, macArch: v.architecture });
      }).catch(() => {});
    }
  }, []);
  return res;
}

export interface DownloadItem {
  os: string; detail: string; href: string; key: Platform; arch?: "arm" | "x86"; icon: React.ReactNode;
  /** Installer id used for analytics and the download count, e.g. "mac-arm64". */
  id: string;
  downloads: number;
  /** Install and first-launch steps, shown in a popup from the "How to install" pill. */
  install?: {
    steps: readonly string[]; req: string;
    why?: { text: string; images: readonly { src: string; alt: string }[] };
    store?: { url: string; badge: string; name: string };
  };
}

export function Downloads({ items }: { items: DownloadItem[] }) {
  const { os, macArch } = useDetectedOs();
  const [thanks, setThanks] = useState<string | null>(null);
  const [help, setHelp] = useState<DownloadItem | null>(null);
  const live = useDownloadCounts();

  // The link itself starts the download (GitHub serves it as a file, so the page stays);
  // celebrate and say thanks on top.
  function celebrate(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const r = e.currentTarget.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2);
    setThanks(id);
  }

  return (
    <>
    {thanks && <ThankYou installer={thanks} onClose={() => setThanks(null)} />}
    {help?.install && <InstallHelp item={help} onClose={() => setHelp(null)} onDownload={(e) => { setHelp(null); celebrate(e, help.id); }} />}
    <SpotlightGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((d) => {
        // Highlight the card for this computer; for Macs only the matching chip when the browser tells us.
        const match = os === d.key && (!macArch || !d.arch || d.arch === macArch);
        const downloads = live?.byInstaller[d.id as InstallerKey] ?? d.downloads;
        return (
          <div key={d.href}
            className={`spot group relative overflow-hidden rounded-2xl border bg-card p-6 transition hover:-translate-y-1 hover:shadow-xl ${
              match ? "border-accent shadow-lg shadow-accent/15" : "border-line hover:border-accent"}`}>
            {/* The whole card downloads; the "How to install" pill sits above this link. */}
            <a href={d.href} data-track="download" data-track-label={d.id} onClick={(e) => celebrate(e, d.id)}
              aria-label={`Download MailClean for ${d.os} (${d.detail})`} className="absolute inset-0 z-[1] rounded-2xl" />
            {match && (
              <span className="absolute top-3 right-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">For your computer</span>
            )}
            <span className="relative block">{d.icon}</span>
            <div className="relative mt-4 font-semibold">{d.os}</div>
            <div className="relative text-sm text-subtle">{d.detail}</div>
            <div className="relative mt-4 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-accent">
                Download <span className="inline-block transition group-hover:translate-y-0.5">↓</span>
              </span>
              {downloads > 0 && (
                <span className="text-xs text-subtle tabular-nums">{downloads.toLocaleString("en-IN")} download{downloads === 1 ? "" : "s"}</span>
              )}
            </div>
            {d.install && (
              <button type="button" onClick={() => setHelp(d)} data-track="install_help" data-track-label={d.id}
                className="relative z-[2] mt-3 inline-flex items-center gap-1 rounded-full border border-line bg-muted/60 px-2.5 py-0.5 text-xs text-subtle hover:border-accent hover:text-accent">
                <span aria-hidden>ⓘ</span> How to install
              </button>
            )}
            {d.install?.store && (
              <a href={d.install.store.url} target="_blank" rel="noopener noreferrer" data-track="store" data-track-label={d.id}
                className="relative z-[2] mt-3 block w-fit" title={`Get MailClean from the ${d.install.store.name} — no security warnings`}>
                <img src={d.install.store.badge} alt={`Get it from ${d.install.store.name}`} width={120} height={33} className="h-8 w-auto" />
              </a>
            )}
          </div>
        );
      })}
    </SpotlightGrid>
    </>
  );
}

/** Popup with install and first-launch steps for one installer. */
function InstallHelp({ item, onClose, onDownload }: {
  item: DownloadItem; onClose: () => void; onDownload: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portal to <body>: the cards sit inside animated (transformed) sections, which would clip a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="shrink-0">{item.icon}</span>
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="text-lg font-semibold">Install on {item.os}</h2>
            <p className="text-sm text-subtle">{item.detail}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-muted hover:text-ink">✕</button>
        </div>
        {item.install!.store && (
          <div className="mt-5 rounded-xl border border-ok/30 bg-ok/5 p-4">
            <div className="text-sm font-semibold">Recommended: get it from the {item.install!.store.name}</div>
            <p className="mt-1 text-sm text-subtle">Signed by Microsoft — no security warnings, and updates install automatically.</p>
            <a href={item.install!.store.url} target="_blank" rel="noopener noreferrer" data-track="store" data-track-label={item.id} className="mt-3 inline-block">
              <img src={item.install!.store.badge} alt={`Get it from ${item.install!.store.name}`} width={161} height={44} className="h-10 w-auto" />
            </a>
          </div>
        )}
        {item.install!.store && <div className="mt-5 text-sm font-semibold">Or install the downloaded file</div>}
        <ol className={`${item.install!.store ? "mt-2" : "mt-5"} list-decimal space-y-2.5 pl-5 text-sm leading-relaxed`}>
          {item.install!.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {item.install!.why && (
          <div className="mt-5 rounded-xl border border-[#b7791f]/30 bg-[#b7791f]/5 p-4">
            <h3 className="text-sm font-semibold">Why does {item.os} show a warning?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-subtle">{item.install!.why.text}</p>
            <div className="mt-3 space-y-3">
              {item.install!.why.images.map((im) => (
                <img key={im.src} src={im.src} alt={im.alt} width={560} height={300} loading="lazy" className="w-full rounded-lg border border-line" />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-subtle">Illustrations — the exact look depends on your {item.os} version.</p>
          </div>
        )}
        <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-subtle"><b className="text-ink">Requires:</b> {item.install!.req}</p>
        <div className="mt-5 flex gap-2">
          <a href={item.href} data-track="download" data-track-label={item.id} onClick={onDownload} autoFocus
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Download for {item.os}</a>
          <button onClick={onClose} className="h-10 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
