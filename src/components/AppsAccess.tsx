"use client";

// "Accounts and apps": links to each provider's connected-apps page, and "Who has your email" —
// companies that have emailed you, built from sender addresses MailClean already stores.

import { useCallback, useEffect, useState } from "react";
import { accessSettings, OTHER_ACCESS_PAGES, providerInfo } from "@/lib/catalog";
import { api, fmtNum, type Account } from "./api";
import { BulkUnsubscribe } from "./BulkUnsubscribe";
import { Avatar } from "./SendersTable";

type Filter = "all" | "security" | "quiet" | "newsletters";
interface Company {
  domain: string; name: string; first: number; last: number; count: number;
  senders: string[]; unsubscribable: string[]; security: boolean; quiet: boolean;
}

const FILTERS: [Filter, string][] = [["all", "All"], ["security", "Security alerts"], ["quiet", "Quiet for a year"], ["newsletters", "Newsletters"]];
const PAGE = 50;

const Ext = () => (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

function when(ms: number) {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (days < 14) return "last week";
  return new Date(ms).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function AppsAccess({ accounts, onOpenSenders, onChanged, toast }: {
  accounts: Account[]; onOpenSenders: (q: string) => void; onChanged: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; counts: Record<Filter, number>; rows: Company[] } | null>(null);
  const [unsubFor, setUnsubFor] = useState<string[] | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ filter, limit: String(PAGE), offset: String(page * PAGE) });
    if (q) p.set("q", q);
    api<typeof data & object>(`/api/companies?${p}`).then(setData).catch((e) => toast(e.message, "err"));
  }, [filter, q, page, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [filter, q]);

  const settings = accounts.map((a) => ({ a, s: accessSettings(a.provider, a.email) })).filter((x) => x.s);
  const btn = "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent";

  return (
    <div className="space-y-8">
      <p className="-mt-3 text-subtle">See which apps can access your email accounts, and which companies have your address.</p>

      <section>
        <h2 className="mb-3 font-semibold">Review app access</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {settings.map(({ a, s }) => (
            <div key={a.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold" style={{ color: providerInfo(a.provider).color }}>{providerInfo(a.provider).icon}</span>
                <span className="truncate font-medium">{a.email}</span>
              </div>
              <p className="mt-1.5 mb-3 text-sm text-subtle">{s!.text}</p>
              <a href={s!.url} target="_blank" rel="noopener noreferrer" className={btn}>{s!.label} <Ext /></a>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-subtle">
          Also check:{" "}
          {OTHER_ACCESS_PAGES.map((o, i) => (
            <span key={o.label}>{i > 0 && " · "}<a href={o.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{o.label}</a></span>
          ))}
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-baseline gap-2">
            <h2 className="font-semibold">Who has your email</h2>
            {data && <span className="text-sm text-subtle">{fmtNum(data.counts.all)} companies</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company…" aria-label="Search company"
              className="h-9 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-accent sm:w-56" />
            {FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`h-9 rounded-full border px-3 text-sm whitespace-nowrap ${filter === f ? "border-accent bg-accent text-white" : "border-line bg-card hover:bg-muted"}`}>
                {label}{f !== "all" && data ? ` · ${fmtNum(data.counts[f])}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs tracking-wide text-subtle uppercase">
              <tr>
                <th className="px-5 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium">Since · last</th>
                <th className="px-3 py-2.5 text-right font-medium">Emails</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((c) => (
                <tr key={c.domain} className="border-b border-line last:border-0 hover:bg-muted/60">
                  <td className="px-5 py-2.5">
                    <button onClick={() => onOpenSenders(c.domain)} className="flex min-w-0 items-center gap-3 text-left" title={`Show senders from ${c.domain}`}>
                      <Avatar name={c.name} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium hover:text-accent">{c.name}</span>
                          {c.security && <span className="rounded px-1.5 py-px text-[10px] font-semibold text-[#b7791f]" style={{ background: "#b7791f1f" }}>Security alert</span>}
                          {c.unsubscribable.length > 0 && <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-subtle">Newsletter</span>}
                          {c.quiet && <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-subtle">Quiet 1 yr+</span>}
                        </span>
                        <span className="block truncate text-xs text-subtle">{c.domain}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-subtle">{new Date(c.first).getFullYear()} · {when(c.last)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.count)}</td>
                  <td className="px-5 py-2.5 text-right">
                    {c.unsubscribable.length > 0 && !c.security ? (
                      <button onClick={() => setUnsubFor(c.unsubscribable)} className={btn}>Unsubscribe</button>
                    ) : c.quiet && !c.security ? (
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`how to delete my ${c.name} account`)}`} target="_blank" rel="noopener noreferrer"
                        title="Search the web for how to close this account" className={btn}>Close account <Ext /></a>
                    ) : (
                      <button onClick={() => onOpenSenders(c.domain)} className={btn}>Emails</button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-subtle">No companies found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.total > PAGE && (
          <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm text-subtle">
            <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.total)} of {fmtNum(data.total)}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-line px-3 py-1 disabled:opacity-40">Prev</button>
              <button disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)} className="rounded-lg border border-line px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>
      <p className="-mt-5 text-xs text-subtle">Built from sender addresses MailClean already has. Nothing new is read.</p>

      {unsubFor && (
        <BulkUnsubscribe senders={unsubFor} onClose={() => setUnsubFor(null)} onDone={() => { load(); onChanged(); }} />
      )}
    </div>
  );
}
