"use client";

// Overview page building blocks: the headline card (space you can free, key numbers, account split),
// the "Clean up next" list and the Gmail tabs list.

import { providerInfo } from "@/lib/catalog";
import { fmtBytes, fmtNum, pct, type Account, type Overview } from "./api";
import { CATEGORY_INFO, type GmailCategory } from "./categories";

/** "You can free up 3.4 GB", the main numbers, and how mail splits across accounts. */
export function Headline({ ov, accounts, period, onAccount, onAllSenders }: {
  ov: Overview; accounts: Account[]; period: string | null; onAccount: (id: string) => void; onAllSenders: () => void;
}) {
  const { freeable } = ov.suggestions;
  const stats = [
    ["Emails", fmtNum(ov.emails)],
    ["Storage", fmtBytes(ov.bytes)],
    ["Unread", pct(ov.emails ? ov.unread / ov.emails : 0)],
    ["Newsletters", fmtNum(ov.newsletters)],
  ];
  const shares = ov.byAccount.filter((s) => s.count > 0);
  const [amount, unit] = fmtBytes(freeable.bytes).split(" ");
  return (
    <section data-tour="summary" className="relative overflow-hidden rounded-2xl border border-line bg-card px-6 pt-8 pb-6">
      <div aria-hidden className="brand-bar absolute inset-x-0 top-0 h-1" />
      <div className="flex flex-wrap gap-x-10 gap-y-6">
        <div className="flex min-w-[260px] flex-1 flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-subtle">
            You can free up
            {period && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">{period}</span>}
          </div>
          <div className="flex items-baseline gap-2 text-accent">
            <span className="font-[family-name:var(--font-inter-tight)] text-6xl leading-none font-bold tracking-tight tabular-nums">{amount}</span>
            {unit && <span className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold">{unit}</span>}
          </div>
          <p className="text-sm text-subtle">
            {fmtNum(freeable.count)} emails in the suggestions below. Everything goes to Trash, so you can undo for 30 days.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => document.getElementById("cleanup")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:opacity-90">Review suggestions</button>
            <button onClick={onAllSenders} className="h-10 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">All senders</button>
          </div>
        </div>
        <div className="flex min-w-[300px] flex-1 flex-col justify-center gap-5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-subtle">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

      {shares.length > 1 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {shares.map((s) => (
              <button key={s.account_id} onClick={() => onAccount(s.account_id)} title={`Show only ${s.email}`}
                className="h-full transition-opacity hover:opacity-80" style={{ width: pct(s.count / ov.emails), background: providerInfo(s.provider).color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-subtle">
            {shares.map((s) => {
              const notice = accounts.find((a) => a.id === s.account_id)?.notice;
              return (
                <span key={s.account_id} className="flex items-center gap-1.5">
                  <button onClick={() => onAccount(s.account_id)} className="flex items-center gap-1.5 hover:text-ink" title={`Show only ${s.email}`}>
                    <span className="size-2 rounded-full" style={{ background: providerInfo(s.provider).color }} aria-hidden />
                    {providerInfo(s.provider).label.replace(/ Mail$/, "")} {fmtNum(s.count)} · {pct(s.count / ov.emails)}
                  </button>
                  {notice && <span tabIndex={0} title={notice} aria-label={notice} className="cursor-help rounded-full border border-line px-1 text-[10px] leading-4">i</span>}
                </span>
              );
            })}
            <span className="hidden xl:ml-auto xl:inline">click to view one inbox</span>
          </div>
        </div>
      )}
        </div>
      </div>
      {shares.length <= 1 && accounts.filter((a) => a.notice && shares.some((s) => s.account_id === a.id)).map((a) => (
        <p key={a.id} className="mt-4 text-xs text-subtle">ⓘ {a.notice}</p>
      ))}
    </section>
  );
}

export type CleanupPick = "never-opened" | "old" | "newsletters";

/** The suggested clean-ups, biggest wins first. */
export function CleanupNext({ ov, onPick }: { ov: Overview; onPick: (p: CleanupPick) => void }) {
  const { old, neverOpened, newsletters } = ov.suggestions;
  const rows = [
    neverOpened.count > 0 && { id: "never-opened" as const, title: "Never opened", tone: "bg-[#e8762b]/12 text-[#b4501a] dark:text-[#f0a06a]",
      icon: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.5 3.4M6.6 6.6C4.4 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1",
      text: `${fmtNum(neverOpened.senders)} senders · ${fmtNum(neverOpened.count)} emails you never read`, size: neverOpened.bytes,
      action: `Review ${fmtNum(neverOpened.senders)} senders` },
    old.count > 0 && { id: "old" as const, title: "Older than a year", tone: "bg-accent/10 text-accent",
      icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
      text: `${fmtNum(old.count)} emails from before ${new Date(old.before).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`, size: old.bytes,
      action: "Review old mail" },
    ov.newsletters > 0 && { id: "newsletters" as const, title: "Newsletters", tone: "bg-ok/12 text-ok",
      icon: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
      text: `${fmtNum(ov.newsletters)} senders you can unsubscribe from`, size: newsletters.bytes,
      action: "Unsubscribe in bulk" },
  ].filter((r): r is Exclude<typeof r, false> => !!r);

  return (
    <section id="cleanup" data-tour="cleanup" className="scroll-mt-6">
      <h2 className="mb-3 text-lg">Clean up next</h2>
      {rows.length === 0 && <p className="rounded-xl border border-line bg-card px-5 py-6 text-sm text-subtle">Nothing obvious to clean up here — nice.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">
            <div className="flex items-center justify-between">
              <span className={`grid size-9 place-items-center rounded-lg ${r.tone}`}>
                <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={r.icon} />
                </svg>
              </span>
              {r.size > 0 && <span className="text-xl font-semibold tabular-nums">{fmtBytes(r.size)}</span>}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{r.title}</div>
              <div className="mt-0.5 text-sm text-subtle">{r.text}</div>
            </div>
            <button onClick={() => onPick(r.id)}
              className="self-start rounded-lg bg-accent/10 px-3.5 py-2 text-sm font-semibold text-accent hover:bg-accent/15">{r.action}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Gmail tabs as a compact list: count and unread share; click one to filter the whole app by it. */
export function GmailTabsList({ categories, selected, onSelect }: {
  categories: Overview["categories"]; selected: GmailCategory | ""; onSelect: (c: GmailCategory | "") => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex items-center border-b border-line px-5 py-3">
        <h2 className="text-lg">Gmail tabs</h2>
        {selected
          ? <button onClick={() => onSelect("")} className="ml-auto text-xs text-accent">Show all</button>
          : <span className="ml-auto text-xs text-subtle">click to filter</span>}
      </div>
      <ul className="px-2 py-1.5">
        {categories.map((c) => {
          const info = CATEGORY_INFO[c.category];
          const unread = c.count ? c.unread / c.count : 0;
          const active = selected === c.category;
          return (
            <li key={c.category}>
              <button onClick={() => onSelect(active ? "" : c.category)} aria-pressed={active}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm ${active ? "bg-accent/10 font-medium" : "hover:bg-muted"}`}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden />
                <span className="flex-1">{info.label}</span>
                <span className="tabular-nums">{fmtNum(c.count)}</span>
                <span className={`w-11 text-right text-xs tabular-nums ${unread >= 0.9 ? "font-medium text-danger" : "text-subtle"}`}>{pct(unread)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-5 py-2 text-[11px] text-subtle">emails · unread</p>
    </section>
  );
}
