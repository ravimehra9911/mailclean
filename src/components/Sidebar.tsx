"use client";

import {
  IconAbout, IconAccounts, IconApps, IconBack, IconHelp, IconNewsletter, IconOverview, IconPrivacy, IconRules, IconSenders,
} from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

export type Tab = "overview" | "senders" | "newsletters" | "rules" | "apps" | "accounts" | "help" | "privacy" | "about";

type Item = { tab: Tab; label: string; Icon: (p: { className?: string }) => React.ReactNode; badge?: number; tour?: string };

/** App navigation: a sidebar on desktop, a scrollable bar on small screens. */
export function Sidebar({ tab, setTab, accountCount, version, demo }: {
  tab: Tab; setTab: (t: Tab) => void; accountCount: number; version: string; demo: boolean;
}) {
  const mailbox: Item[] = [
    { tab: "overview", label: "Overview", Icon: IconOverview },
    { tab: "senders", label: "Senders", Icon: IconSenders },
    { tab: "newsletters", label: "Newsletters", Icon: IconNewsletter },
    { tab: "rules", label: "Rules", Icon: IconRules },
    { tab: "apps", label: "Apps & access", Icon: IconApps },
    { tab: "accounts", label: "Accounts", Icon: IconAccounts, badge: accountCount },
  ];
  const support: Item[] = [
    { tab: "help", label: "Help", Icon: IconHelp, tour: "help" },
    { tab: "privacy", label: "Privacy", Icon: IconPrivacy },
    { tab: "about", label: "About", Icon: IconAbout },
  ];

  const item = (i: Item) => {
    const active = tab === i.tab;
    return (
      <button key={i.tab} onClick={() => setTab(i.tab)} data-tour={i.tour} aria-current={active ? "page" : undefined}
        className={`group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          active ? "bg-accent/10 font-medium text-accent" : "text-subtle hover:bg-muted hover:text-ink"}`}>
        {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 hidden w-0.5 rounded-full bg-accent md:block" />}
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

  const group = (label: string) => (
    <div className="hidden px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle/80 uppercase md:block">{label}</div>
  );

  return (
    <aside className="border-b border-line bg-card md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <img src="/icon.svg" alt="" width={30} height={30} className="size-[30px]" />
        <span className="text-[17px] font-semibold tracking-tight">MailClean</span>
      </div>

      <nav data-tour="nav" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-0">
        {demo && (
          <a href="/" className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-muted md:mb-1">
            <IconBack className="size-[18px]" /> <span className="whitespace-nowrap">Back to website</span>
          </a>
        )}
        {group("Mailbox")}
        {mailbox.map(item)}
        {group("Support")}
        {support.map(item)}
      </nav>

      <div className="hidden items-center justify-between gap-2 border-t border-line px-4 py-3 md:flex">
        <div data-tour="theme"><ThemeToggle /></div>
        {version && <span className="text-[11px] text-subtle tabular-nums">v{version}</span>}
      </div>
    </aside>
  );
}
