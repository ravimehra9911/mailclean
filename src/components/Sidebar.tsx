"use client";

import { useEffect, useRef, useState } from "react";
import { providerInfo } from "@/lib/catalog";
import { REPO_URL } from "@/lib/site";
import { fmtNum, type Account } from "./api";
import {
  IconAbout, IconAccounts, IconApps, IconBack, IconDownload, IconLock, IconHelp, IconNewsletter, IconOverview, IconPrivacy, IconRules, IconSenders,
} from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

export type Tab = "overview" | "senders" | "newsletters" | "rules" | "apps" | "downloads" | "accounts" | "help" | "privacy" | "security" | "about";

type Item = { tab: Tab; label: string; Icon: (p: { className?: string }) => React.ReactNode; badge?: number; tour?: string };

const GROUPS: { label: string; items: Item["tab"][] }[] = [
  { label: "Clean", items: ["overview", "senders", "newsletters"] },
  { label: "Automate", items: ["rules"] },
  { label: "Your data", items: ["downloads", "apps", "accounts"] },
];
// Rarely used pages: in the "?" menu on desktop, at the end of the scrolling bar on small screens.
const SUPPORT: Tab[] = ["help", "privacy", "security", "about"];

/** App navigation: a sidebar on desktop, a scrollable bar on small screens. */
export function Sidebar({ tab, setTab, accounts, accountId, setAccountId, inboxCounts, downloading = 0, version, demo, updateAvailable, onLock }: {
  tab: Tab; setTab: (t: Tab) => void; version: string; demo: boolean;
  /** Connected inboxes, listed in the Mailboxes card; clicking one shows only that inbox. */
  accounts: Account[]; accountId: string; setAccountId: (id: string) => void;
  /** Emails per account in the chosen dates; the scanned totals until the numbers load. */
  inboxCounts?: Record<string, number>;
  /** Attachment downloads running now, shown as a badge. */
  downloading?: number;
  /** A newer MailClean is available: dot on the help menu, badge on About. */
  updateAvailable?: boolean;
  /** Shown when an app-lock PIN is set. */
  onLock?: () => void;
}) {
  const items: Record<Tab, Item> = {
    overview: { tab: "overview", label: "Overview", Icon: IconOverview },
    senders: { tab: "senders", label: "Senders", Icon: IconSenders },
    newsletters: { tab: "newsletters", label: "Newsletters", Icon: IconNewsletter },
    rules: { tab: "rules", label: "Rules", Icon: IconRules },
    downloads: { tab: "downloads", label: "Downloads", Icon: IconDownload, badge: downloading },
    apps: { tab: "apps", label: "Apps & access", Icon: IconApps },
    accounts: { tab: "accounts", label: "Accounts", Icon: IconAccounts, badge: accounts.length },
    help: { tab: "help", label: "Help", Icon: IconHelp },
    privacy: { tab: "privacy", label: "Privacy", Icon: IconPrivacy },
    security: { tab: "security", label: "Security", Icon: IconLock },
    about: { tab: "about", label: "About", Icon: IconAbout },
  };

  const item = (i: Item, className = "") => {
    const active = tab === i.tab;
    return (
      <button key={i.tab} onClick={() => setTab(i.tab)} data-tour={i.tour} aria-current={active ? "page" : undefined}
        className={`group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${className} ${
          active ? "bg-accent/10 font-semibold text-accent" : "font-medium text-subtle hover:bg-muted hover:text-ink"}`}>
        <i.Icon className={`size-[18px] shrink-0 ${active ? "" : "opacity-80 group-hover:opacity-100"}`} />
        <span className="whitespace-nowrap">{i.label}</span>
        {!!i.badge && (
          <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${active ? "bg-accent/15" : "bg-muted text-subtle"}`}>
            {i.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="border-b border-line bg-card md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <img src="/brand/mailclean-mark.png" alt="" width={43} height={24} className="h-6 w-auto" />
        <span className="wordmark text-[18px]">Mail<b>Clean</b></span>
      </div>

      <nav data-tour="nav" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-0">
        {demo && (
          <a href="/" className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-muted md:mb-1">
            <IconBack className="size-[18px]" /> <span className="whitespace-nowrap">Back to website</span>
          </a>
        )}
        {GROUPS.map((g, i) => (
          <div key={g.label} className="contents">
            <div className={`hidden px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle/80 uppercase md:block ${i ? "pt-5" : "pt-2"}`}>{g.label}</div>
            {g.items.map((t) => item(items[t]))}
          </div>
        ))}
        {SUPPORT.map((t) => item(items[t], "md:hidden"))}
      </nav>

      {accounts.length > 0 && <Mailboxes accounts={accounts} counts={inboxCounts} accountId={accountId} setAccountId={setAccountId} onAdd={() => setTab("accounts")} />}

      <div className="hidden items-center gap-2 border-t border-line px-4 py-3 md:flex">
        <div data-tour="theme"><ThemeToggle /></div>
        {onLock && (
          <button onClick={onLock} title="Lock MailClean" aria-label="Lock MailClean"
            className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-muted hover:text-ink">
            <IconLock className="size-[18px]" />
          </button>
        )}
        <HelpMenu tab={tab} setTab={setTab} version={version} updateAvailable={updateAvailable} />
      </div>
    </aside>
  );
}

/** Connected inboxes with their email counts; picks which inbox the pages show (all, or one). */
function Mailboxes({ accounts, counts, accountId, setAccountId, onAdd }: {
  accounts: Account[]; counts?: Record<string, number>; accountId: string; setAccountId: (id: string) => void; onAdd: () => void;
}) {
  const count = (a: Account) => counts?.[a.id] ?? a.synced;
  const syncing = accounts.some((a) => a.sync_status === "syncing");
  const failed = accounts.filter((a) => a.sync_status === "error").length;
  const times = accounts.map((a) => a.last_sync_at).filter((t): t is number => !!t);
  const total = accounts.reduce((n, a) => n + count(a), 0);
  const row = (id: string, label: React.ReactNode, count: number, title: string) => (
    <button key={id || "all"} type="button" onClick={() => setAccountId(id)} aria-pressed={accountId === id} title={title}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] ${accountId === id ? "bg-card font-semibold text-ink shadow-sm" : "text-ink/80 hover:bg-card/60"}`}>
      {label}
      <span className="ml-auto text-xs font-normal text-subtle tabular-nums">{fmtNum(count)}</span>
    </button>
  );
  return (
    <div data-tour="account-filter" className="mx-3 mb-3 hidden flex-col gap-0.5 rounded-xl border border-line bg-muted/60 p-2 md:flex">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-semibold tracking-wider text-subtle uppercase">Mailboxes</span>
        <button type="button" onClick={onAdd} className="text-xs font-medium text-accent hover:underline">+ Add</button>
      </div>
      {accounts.length > 1 && row("", <span className="flex-1">All inboxes</span>, total, "Show all inboxes together")}
      {accounts.map((a) => {
        const p = providerInfo(a.provider);
        return row(a.id, (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label.replace(/ Mail$/, "")}</span>
            {a.sync_status === "error" && <span title={a.sync_error ?? "Sync failed"} className="text-[11px] font-medium text-danger">!</span>}
          </>
        ), count(a), `${a.email} — show only this inbox`);
      })}
      <div className={`flex items-center gap-1.5 px-2 pt-1 text-xs ${failed ? "text-danger" : "text-ok"}`}>
        {syncing ? <span className="text-subtle">Syncing…</span>
          : failed ? <button type="button" onClick={onAdd} className="hover:underline">{failed} inbox{failed > 1 ? "es" : ""} need attention</button>
          : times.length > 0 && (
            <>
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5L20 7" /></svg>
              Synced {ago(Math.min(...times))}
            </>
          )}
      </div>
    </div>
  );
}

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** The "?" button: Help, Privacy, Security, Report a problem and About, in a small menu above it. */
function HelpMenu({ tab, setTab, version, updateAvailable }: {
  tab: Tab; setTab: (t: Tab) => void; version: string; updateAvailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const onSupportPage = SUPPORT.includes(tab);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const go = (t: Tab) => { setTab(t); setOpen(false); };
  const row = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-muted";
  const pageRow = (t: Tab, label: string, Icon: Item["Icon"], extra?: React.ReactNode) => (
    <button role="menuitem" type="button" onClick={() => go(t)} aria-current={tab === t ? "page" : undefined}
      className={`${row} ${tab === t ? "text-accent" : "text-ink/80"}`}>
      <Icon className="size-4 shrink-0" /> <span className="flex-1">{label}</span>{extra}
    </button>
  );

  return (
    <div ref={wrap} className="relative ml-auto" data-tour="help">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        title="Help and info" aria-label={updateAvailable ? "Help and info — update available" : "Help and info"}
        className={`relative grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-ink ${open || onSupportPage ? "bg-accent/10 text-accent" : "text-subtle"}`}>
        <IconHelp className="size-[18px]" />
        {updateAvailable && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-card" />}
      </button>
      {open && (
        <div role="menu" aria-label="Help and info"
          className="absolute right-0 bottom-full z-40 mb-2 w-56 rounded-xl border border-line bg-card p-1.5 shadow-xl">
          {pageRow("help", "Help & FAQ", IconHelp)}
          {pageRow("privacy", "Privacy", IconPrivacy)}
          {pageRow("security", "Security", IconLock)}
          <div className="mx-1.5 my-1 h-px bg-line" />
          <a role="menuitem" href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className={`${row} text-ink/80`}>
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span className="flex-1">Report a problem</span><span aria-hidden className="text-subtle">↗</span>
          </a>
          {pageRow("about", "About MailClean", IconAbout, updateAvailable
            ? <span className="rounded-full bg-accent/10 px-1.5 py-px text-[11px] font-semibold text-accent">Update</span>
            : version && <span className="text-xs text-subtle tabular-nums">v{version}</span>)}
        </div>
      )}
    </div>
  );
}
