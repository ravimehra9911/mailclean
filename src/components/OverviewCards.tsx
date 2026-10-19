"use client";

// Overview page building blocks: the headline card (space you can free, key numbers, account split),
// the "Clean up next" list and the Gmail tabs list.

import { providerInfo } from "@/lib/catalog";
import { fmtBytes, fmtNum, pct, type Account, type Overview } from "./api";
import { CATEGORY_INFO, type GmailCategory } from "./categories";

/** "You can free up 3.4 GB", the main numbers, and how mail splits across accounts. */
export function Headline({ ov, accounts, period, onAccount }: {
  ov: Overview; accounts: Account[]; period: string | null; onAccount: (id: string) => void;
}) {
  const { freeable } = ov.suggestions;
  const stats = [
    ["Emails", fmtNum(ov.emails)],
    ["Storage", fmtBytes(ov.bytes)],
    ["Unread", pct(ov.emails ? ov.unread / ov.emails : 0)],
    ["Newsletters", fmtNum(ov.newsletters)],
  ];
  const shares = ov.byAccount.filter((s) => s.count > 0);
  return (
    <section data-tour="summary" className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-subtle">
            You can free up
            {period && <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">{period}</span>}
          </div>
          <div className="text-3xl font-semibold tracking-tight text-accent tabular-nums">{fmtBytes(freeable.bytes)}</div>
          <div className="text-xs text-subtle">{fmtNum(freeable.count)} emails in the suggestions below</div>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 sm:ml-auto">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-subtle">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {shares.length > 1 && (
        <div className="mt-5">
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
            <span className="hidden sm:ml-auto sm:inline">click an account to view only that inbox</span>
          </div>
        </div>
      )}
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
    neverOpened.count > 0 && { id: "never-opened" as const, title: "Never opened", tone: "text-danger", icon: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.5 3.4M6.6 6.6C4.4 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1",
      text: `${fmtNum(neverOpened.senders)} senders · ${fmtNum(neverOpened.count)} emails`, size: neverOpened.bytes },
    old.count > 0 && { id: "old" as const, title: "Older than a year", tone: "text-[#b7791f]", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
      text: `${fmtNum(old.count)} emails before ${new Date(old.before).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`, size: old.bytes },
    ov.newsletters > 0 && { id: "newsletters" as const, title: "Newsletters", tone: "text-ok", icon: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7",
      text: `${fmtNum(ov.newsletters)} senders you can unsubscribe from`, size: newsletters.bytes },
  ].filter((r): r is Exclude<typeof r, false> => !!r);

  return (
    <section data-tour="cleanup" className="overflow-hidden rounded-xl border border-line bg-card">
      <h2 className="border-b border-line px-5 py-3 font-semibold">Clean up next</h2>
      {rows.length === 0 && <p className="px-5 py-6 text-sm text-subtle">Nothing obvious to clean up here — nice.</p>}
      {rows.map((r) => (
        <button key={r.id} onClick={() => onPick(r.id)}
          className="group flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left last:border-0 hover:bg-muted">
          <svg viewBox="0 0 24 24" className={`size-5 shrink-0 ${r.tone}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={r.icon} />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.title}</div>
            <div className="truncate text-xs text-subtle">{r.text}</div>
          </div>
          {r.size > 0 && <span className="shrink-0 text-sm text-subtle tabular-nums">{fmtBytes(r.size)}</span>}
          <span className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium group-hover:border-accent group-hover:text-accent">Review</span>
        </button>
      ))}
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
        <h2 className="font-semibold">Gmail tabs</h2>
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
