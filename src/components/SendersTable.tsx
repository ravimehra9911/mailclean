"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mailboxLink, providerInfo } from "@/lib/catalog";
import { api, fmtBytes, fmtDate, fmtNum, pct, type AccountShare, type Sender } from "./api";
import { rangeParams, type DateRange } from "./DateFilter";
import { AttachmentsDialog } from "./AttachmentsDialog";
import { BulkUnsubscribe } from "./BulkUnsubscribe";
import { CATEGORY_INFO, type GmailCategory } from "./categories";

/** What a clean-up leaves alone; sent to /api/clean. */
export interface KeepOptions { keepFlagged: boolean; keepNewest: number }

const keepNote = (k: KeepOptions) => {
  const parts = [k.keepNewest && `the newest ${k.keepNewest} from each sender`, k.keepFlagged && "starred and important emails"].filter(Boolean);
  return parts.length ? `\n\nKept: ${parts.join(" and ")}.` : "";
};

type Filter = "all" | "newsletters" | "mostly-unread" | "attachments";
const FILTERS: [Filter, string][] = [["all", "All senders"], ["newsletters", "Newsletters"], ["mostly-unread", "Mostly unread"], ["attachments", "Has attachments"]];
type Sort = "name" | "account" | "count" | "bytes" | "unread" | "last" | "attachments";
type Dir = "asc" | "desc";

export function SendersTable(props: {
  accountId: string;
  range: DateRange;
  /** Only emails in this Gmail tab. */
  category?: GmailCategory | "";
  /** What trashing or archiving leaves alone. */
  keep: KeepOptions;
  setKeep?: (k: KeepOptions) => void;
  /** Short name per account email (e.g. "Gmail", or "Gmail · work" when two accounts share a provider). */
  accountLabels?: Record<string, string>;
  initialFilter?: Filter;
  /** Search text to start with, e.g. a company domain from Accounts and apps. */
  initialQuery?: string;
  pageSize?: number;
  compact?: boolean;
  refreshKey: number;
  onChanged: () => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const { accountId, range, category = "", keep, setKeep, compact, pageSize = 25, refreshKey, onChanged, toast, accountLabels } = props;
  const [fullAccounts, setFullAccounts] = useFullAccountLabels();
  const [filter, setFilter] = useState<Filter>(props.initialFilter ?? "all");
  const [sort, setSort] = useState<{ by: Sort; dir: Dir }>({ by: "count", dir: "desc" });
  const [q, setQ] = useState(props.initialQuery ?? "");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Sender[]; total: number; counts?: Record<Filter, number> }>({ rows: [], total: 0 });
  const searchBox = useRef<HTMLInputElement>(null);
  // "/" jumps to the search box, as in Gmail.
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || (t instanceof Element && t.closest("input, textarea, select, [contenteditable]"))) return;
      e.preventDefault();
      searchBox.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [unsubFor, setUnsubFor] = useState<string[] | null>(null);
  const [attFor, setAttFor] = useState<Parameters<typeof AttachmentsDialog>[0] | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ sort: sort.by, dir: sort.dir, filter, limit: String(pageSize), offset: String(page * pageSize) });
    if (accountId) p.set("account", accountId);
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    rangeParams(p, range);
    setData(await api(`/api/senders?${p}`));
  }, [accountId, range, category, sort, filter, q, page, pageSize]);

  useEffect(() => { load().catch((e) => toast(e.message, "err")); }, [load, refreshKey, toast]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [accountId, range, category, filter, sort, q]);

  // Click a column: sort by it (text columns start A→Z, numbers largest first); click again to flip.
  const sortBy = (by: Sort) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: by === "name" || by === "account" ? "asc" : "desc" }));
  const th = (by: Sort, label: string, align: "left" | "right" = "left") => (
    <SortHeader label={label} active={sort.by === by} dir={sort.dir} align={align} onClick={() => sortBy(by)} />
  );

  const toggle = (email: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.email));
  const toggleAll = () =>
    setSelected((s) => { const n = new Set(s); data.rows.forEach((r) => (allOnPage ? n.delete(r.email) : n.add(r.email))); return n; });

  const selRows = data.rows.filter((r) => selected.has(r.email));
  const selCount = selRows.reduce((a, r) => a + r.count, 0);
  const selBytes = selRows.reduce((a, r) => a + r.bytes, 0);
  const selFiles = selRows.reduce((a, r) => a + (r.attachments ?? 0), 0);
  const scope = { accountId: accountId || undefined, from: range.from, to: range.to, category: category || undefined };
  /** Opens the attachments dialog for these senders. */
  const saveAttachments = (rows: Sender[]) => setAttFor({
    senders: rows.map((r) => r.email),
    names: Object.fromEntries(rows.map((r) => [r.email, r.name || r.email.split("@")[1] || r.email])),
    scope,
    onClose: () => setAttFor(null),
  });

  async function clean(emails: string[], action: "trash" | "archive") {
    const rows = data.rows.filter((r) => emails.includes(r.email));
    const n = rows.reduce((a, r) => a + (action === "archive" ? r.inbox : r.count), 0);
    const verb = action === "trash" ? "Move to Trash" : "Archive";
    const where = category ? ` in ${CATEGORY_INFO[category].label}` : "";
    if (!confirm(`${verb} up to ${fmtNum(n)} emails${where} from ${emails.length} sender${emails.length > 1 ? "s" : ""}?` +
      keepNote(keep) +
      (action === "trash" ? "\n\nTrashed mail can be restored for 30 days." : ""))) return;
    setBusy(action);
    try {
      const r = await api<{ count: number; errors: string[] }>("/api/clean", {
        method: "POST", json: { senders: emails, action, accountId: accountId || undefined, from: range.from, to: range.to, category: category || undefined, ...keep },
      });
      toast(`${action === "trash" ? "Trashed" : "Archived"} ${fmtNum(r.count)} emails` + (r.errors.length ? ` — ${r.errors.join("; ")}` : ""),
        r.errors.length ? "err" : "ok");
      setSelected(new Set());
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  /** Rules that trash these senders' mail after every sync — a "block" for senders without unsubscribe links. */
  async function alwaysTrash(emails: string[]) {
    if (!confirm(`Always move emails from ${emails.length} sender${emails.length > 1 ? "s" : ""} to Trash?\n\n` +
      "MailClean adds a rule for each one. It runs after every sync, keeps starred and important emails, and can be turned off on the Rules page.")) return;
    setBusy("rule");
    try {
      for (const sender of emails) await api("/api/rules", { method: "POST", json: { sender, action: "trash", older_than_days: 0 } });
      toast(`Added ${emails.length} rule${emails.length > 1 ? "s" : ""} — see the Rules page. Existing emails are trashed at the next sync, or click Run rules now.`);
      setSelected(new Set());
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function unsub(email: string) {
    setBusy(`unsub:${email}`);
    try {
      const r = await api<{ status: "done" | "open" | "none"; url?: string }>("/api/unsubscribe", { method: "POST", json: { sender: email } });
      if (r.status === "done") toast(`Unsubscribed from ${email}`);
      else if (r.status === "open" && r.url) {
        window.open(r.url, "_blank", "noopener,noreferrer");
        toast("Opened the sender's unsubscribe page — finish there");
      } else toast("This sender doesn't offer an unsubscribe link", "err");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-line">
          <div role="tablist" aria-label="Show senders" className="-mb-px flex gap-5 overflow-x-auto">
            {FILTERS.map(([f, label]) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                className={`flex shrink-0 items-center gap-2 border-b-2 pt-2 pb-3 text-sm whitespace-nowrap ${filter === f
                  ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-subtle hover:text-ink"}`}>
                {label}
                {data.counts && (
                  <span className={`rounded-full px-1.5 py-px text-xs tabular-nums ${filter === f ? "bg-accent/10 text-accent" : "bg-muted text-subtle"}`}>
                    {fmtNum(data.counts[f])}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mb-2 flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-card px-3 text-subtle focus-within:border-accent sm:w-64 sm:flex-none">
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="sr-only">Search senders</span>
              <input ref={searchBox} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search senders"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
              {!q && <kbd className="hidden rounded border border-line px-1.5 font-mono text-[11px] text-subtle sm:inline">/</kbd>}
            </label>
            {setKeep && <KeepMenu keep={keep} setKeep={setKeep} />}
          </div>
        </div>
      )}

      {attFor && <AttachmentsDialog {...attFor} />}
      {unsubFor && (
        <BulkUnsubscribe senders={unsubFor} emails={selCount} onClose={() => setUnsubFor(null)}
          onDone={onChanged} onTrash={() => { setUnsubFor(null); clean(unsubFor, "trash"); }} />
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-white shadow-lg">
          <span><b>{selected.size}</b> senders · {fmtNum(selCount)} emails · {fmtBytes(selBytes)}{selFiles > 0 && ` · ${fmtNum(selFiles)} attachments`}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button disabled={!!busy} title="Save the attachments from these senders' emails to your Downloads folder"
              onClick={() => setAttFor({
                senders: [...selected],
                names: Object.fromEntries(selRows.map((r) => [r.email, r.name || r.email.split("@")[1] || r.email])),
                scope,
                onClose: () => setAttFor(null),
              })}
              className="rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 disabled:opacity-50">Attachments</button>
            <button disabled={!!busy} onClick={() => setUnsubFor([...selected])}
              className="rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 disabled:opacity-50">Unsubscribe</button>
            <button disabled={!!busy} onClick={() => alwaysTrash([...selected])}
              title="Make a rule: new emails from these senders go straight to Trash after every sync"
              className="rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 disabled:opacity-50">Always trash</button>
            <button disabled={!!busy} onClick={() => clean([...selected], "archive")}
              className="rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 disabled:opacity-50">Archive</button>
            <button disabled={!!busy} onClick={() => clean([...selected], "trash")}
              className="rounded-lg bg-danger px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50">
              {busy === "trash" ? "Trashing…" : "Move to Trash"}
            </button>
            <button onClick={() => setSelected(new Set())} className="px-2 opacity-70 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {/* Phones: one card per sender. */}
      <ul className="space-y-2 md:hidden">
        {data.rows.map((r) => {
          const unreadRate = r.count ? r.unread / r.count : 0;
          const on = selected.has(r.email);
          return (
            <li key={r.email} className={`rounded-xl border p-3 ${on ? "border-accent/50 bg-accent/5" : "border-line bg-card"}`}>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" checked={on} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} className="size-5 shrink-0 accent-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold">{r.name || r.email}</span>
                    {r.category && !category && <TabLabel category={r.category} share={r.category_share} />}
                  </div>
                  <div className="truncate text-xs text-subtle">{r.email}</div>
                </div>
                <TrashButton name={r.name || r.email} disabled={!!busy} onClick={() => clean([r.email], "trash")} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 pl-7.5 text-xs text-ink/80 tabular-nums">
                <span><b className="font-semibold text-ink">{fmtNum(r.count)}</b> emails</span>
                <span>{fmtBytes(r.bytes)}</span>
                <span className={unreadRate >= 0.9 ? "font-semibold text-[#b4501a] dark:text-[#f0a06a]" : ""}>{pct(unreadRate)} unread</span>
                <FilesCell count={r.attachments} name={r.name || r.email} onOpen={() => saveAttachments([r])} hideEmpty />
                <span className="ml-auto"><UnsubCell r={r} busy={busy} onUnsub={unsub} /></span>
              </div>
            </li>
          );
        })}
        {data.rows.length === 0 && <li className="rounded-xl border border-line bg-card px-3 py-10 text-center text-sm text-subtle">No senders found.</li>}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
        <table className="w-full min-w-[880px] text-sm [&_td]:whitespace-nowrap">
          <thead className="border-b border-line text-left text-xs text-subtle">
            <tr data-tour="sort-headers">
              <th className="w-10 py-2.5 pr-1 pl-4"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all" className="accent-accent" /></th>
              {th("name", "Sender")}
              <SortHeader label="Inbox" active={sort.by === "account"} dir={sort.dir} align="left" onClick={() => sortBy("account")}
                extra={accountLabels && (
                  <span role="radiogroup" aria-label="Inbox names" className="ml-1.5 inline-flex rounded-md bg-muted p-px align-middle text-[10px] font-medium">
                    {([[false, "Short", "Short inbox names"], [true, "Full", "Full email addresses"]] as const).map(([full, label, title]) => (
                      <button key={label} type="button" role="radio" aria-checked={fullAccounts === full} title={title}
                        onClick={() => setFullAccounts(full)}
                        className={`rounded px-1.5 py-px ${fullAccounts === full ? "bg-card text-ink shadow-sm" : "text-subtle hover:text-ink"}`}>
                        {label}
                      </button>
                    ))}
                  </span>
                )} />
              <SortHeader label="Emails" active={sort.by === "count"} dir={sort.dir} align="right" onClick={() => sortBy("count")}
                extra={<button type="button" onClick={() => sortBy("bytes")} title="Sort by size"
                  className={`ml-1 hover:text-ink ${sort.by === "bytes" ? "font-semibold text-ink" : ""}`}>· Size{sort.by === "bytes" && (sort.dir === "desc" ? " ↓" : " ↑")}</button>} />
              {th("attachments", "Files", "right")}
              {th("unread", "Unread")}
              {!compact && th("last", "Last email")}
              <th className="py-2.5 pr-4 pl-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, rowIndex) => {
              const unreadRate = r.count ? r.unread / r.count : 0;
              const high = unreadRate >= 0.9;
              const on = selected.has(r.email);
              return (
                <tr key={r.email} className={`group border-b border-line/60 last:border-0 ${on ? "bg-accent/5" : "hover:bg-muted/60"}`}>
                  <td className="py-2.5 pr-1 pl-4" data-tour={rowIndex === 0 ? "select" : undefined}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} className="accent-accent" />
                  </td>
                  <td className="w-full max-w-0 min-w-[220px] px-2 py-2.5" style={{ whiteSpace: "normal" }}>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name || r.email} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold">{r.name || r.email}</span>
                          {r.category && !category && <TabLabel category={r.category} share={r.category_share} />}
                        </div>
                        <div className="flex min-w-0 items-center text-xs text-subtle">
                          <span className="truncate">{r.email}</span>
                          <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <CopyButton text={r.email} toast={toast} />
                            <SearchButton sender={r.email} shares={r.byAccount} toast={toast} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col items-start gap-0.5">
                      {r.byAccount.map((s) => <InboxLink key={s.account_id} share={s} sender={r.email} toast={toast}
                        label={!fullAccounts ? accountLabels?.[s.email] : undefined} showCount={r.byAccount.length > 1} />)}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <div className="font-semibold">{fmtNum(r.count)}</div>
                    <div className="text-xs text-subtle">{fmtBytes(r.bytes)}</div>
                  </td>
                  <td className="px-2 py-2.5 text-right"><FilesCell count={r.attachments} name={r.name || r.email} onOpen={() => saveAttachments([r])} /></td>
                  <td className="px-2 py-2.5">
                    <div className="flex w-28 items-center gap-2" title={`${fmtNum(r.unread)} of ${fmtNum(r.count)} unread`}>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className={`block h-full ${high ? "bg-[#e8762b]" : "bg-accent"}`} style={{ width: pct(unreadRate) }} />
                      </span>
                      <span className={`w-9 text-right text-[13px] tabular-nums ${high ? "font-semibold text-[#b4501a] dark:text-[#f0a06a]" : "text-ink/80"}`}>{pct(unreadRate)}</span>
                    </div>
                  </td>
                  {!compact && <td className="px-2 py-2.5 text-[13px] text-subtle">{fmtDate(r.last)}</td>}
                  <td className="py-2.5 pr-4 pl-2">
                    <div className="flex items-center justify-end gap-1" data-tour={rowIndex === 0 ? "row-actions" : undefined}>
                      <UnsubCell r={r} busy={busy} onUnsub={unsub} reveal />
                      <TrashButton name={r.name || r.email} disabled={!!busy} onClick={() => clean([r.email], "trash")} reveal />
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-subtle">No senders found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data.total > pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm text-subtle">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.total)} of {fmtNum(data.total)}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-line px-3 py-1 disabled:opacity-40">Prev</button>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-lg border border-line px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, active, dir, align, onClick, extra }: {
  label: string; active: boolean; dir: Dir; align: "left" | "right"; onClick: () => void; extra?: React.ReactNode;
}) {
  return (
    <th className={`px-2 py-2.5 whitespace-nowrap ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={onClick} title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 font-medium hover:text-ink ${active ? "font-semibold text-ink" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <svg viewBox="0 0 10 14" className="h-3 w-2.5" aria-hidden>
          <path d="M5 1 L9 5.5 H1 Z" fill="currentColor" opacity={active && dir === "asc" ? 1 : 0.25} />
          <path d="M5 13 L9 8.5 H1 Z" fill="currentColor" opacity={active && dir === "desc" ? 1 : 0.25} />
        </svg>
      </button>
      {extra}
    </th>
  );
}

/** Copies text, falling back to a hidden textarea where the async Clipboard API is blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Opens the user's webmail with this sender's emails searched. Uses the account with the most emails
 * from the sender; the account labels in the row open a specific inbox.
 */
function SearchButton({ sender, shares, toast }: {
  sender: string; shares: AccountShare[]; toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const top = shares[0];
  const link = top ? mailboxLink(top.provider, top.email, sender) : null;
  if (!top || !link) return null;
  const p = providerInfo(top.provider);
  const title = link.search
    ? `Search ${p.label} (${top.email}) for emails from ${sender}`
    : `Open ${p.label} — the address is copied so you can paste it into search`;
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" title={title} aria-label={title}
      onClick={() => {
        if (!link.search) copyText(sender).then((ok) => ok && toast(`Copied ${sender} — paste it into ${p.label} search`));
      }}
      className="ml-0.5 grid size-5 shrink-0 place-items-center rounded text-subtle opacity-60 hover:bg-muted hover:text-ink hover:opacity-100">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
    </a>
  );
}

function CopyButton({ text, toast }: { text: string; toast: (msg: string, kind?: "ok" | "err") => void }) {
  const [done, setDone] = useState(false);
  async function copy() {
    if (await copyText(text)) {
      setDone(true);
      toast(`Copied ${text}`);
      setTimeout(() => setDone(false), 1500);
    } else {
      toast("Could not copy to the clipboard", "err");
    }
  }
  return (
    <button type="button" onClick={copy} title={`Copy ${text}`} aria-label={`Copy ${text}`}
      className="ml-1 grid size-5 shrink-0 place-items-center rounded text-subtle opacity-60 hover:bg-muted hover:text-ink hover:opacity-100">
      {done ? (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3 3 7-7" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" />
        </svg>
      )}
    </button>
  );
}


/** "Keeping starred + newest 5": what trashing and archiving leave alone, set in a small menu. */
function KeepMenu({ keep, setKeep }: { keep: KeepOptions; setKeep: (k: KeepOptions) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const parts = [keep.keepFlagged && "starred", keep.keepNewest > 0 && `newest ${keep.keepNewest}`].filter(Boolean);
  return (
    <div ref={wrap} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        title="What Trash all, Archive and Move to Trash leave alone"
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium whitespace-nowrap ${parts.length
          ? "border-accent bg-accent/10 text-accent hover:bg-accent/15" : "border-line bg-card text-subtle hover:bg-muted"}`}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" />
        </svg>
        {parts.length ? `Keeping ${parts.join(" + ")}` : "Keep nothing"}
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="dialog" aria-label="What clean-ups keep"
          className="absolute top-full right-0 z-30 mt-2 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3.5 rounded-xl border border-line bg-card p-4 shadow-xl">
          <div>
            <div className="text-sm font-semibold">When you trash or archive, keep…</div>
            <div className="mt-0.5 text-xs text-subtle">Applies to Trash all, Archive and Move to Trash.</div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-sm">
            <input type="checkbox" checked={keep.keepFlagged} onChange={(e) => setKeep({ ...keep, keepFlagged: e.target.checked })} className="size-4 accent-accent" />
            Starred &amp; important emails
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-subtle">Newest emails from each sender</span>
            <div role="radiogroup" aria-label="Keep newest emails" className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-0.5">
              {[0, 1, 5, 10, 25].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={keep.keepNewest === n} onClick={() => setKeep({ ...keep, keepNewest: n })}
                  className={`h-8 rounded-md text-sm tabular-nums ${keep.keepNewest === n ? "bg-card font-semibold text-ink shadow-sm" : "font-medium text-subtle hover:text-ink"}`}>
                  {n || "None"}
                </button>
              ))}
            </div>
          </div>
          <p className="border-t border-line pt-2.5 text-xs text-subtle">Trash can be restored for 30 days.</p>
        </div>
      )}
    </div>
  );
}

/** Attached files from a sender: a button that opens the save dialog, a dash when there are none. */
function FilesCell({ count, name, onOpen, hideEmpty }: { count: number | null; name: string; onOpen: () => void; hideEmpty?: boolean }) {
  if (hideEmpty && !count) return null;
  if (count === null) {
    return <span title="Not counted yet — click Sync to count attachments" className="cursor-help text-subtle/60">–</span>;
  }
  if (!count) return <span title="No attachments" className="text-subtle/50">—</span>;
  return (
    <button type="button" onClick={onOpen} title={`Save ${fmtNum(count)} attachments from ${name}`}
      className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent tabular-nums hover:bg-accent/15">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
      </svg>
      {fmtNum(count)}
    </button>
  );
}

/** Gmail tab as a coloured dot and its name. */
function TabLabel({ category, share }: { category: GmailCategory; share: number }) {
  const c = CATEGORY_INFO[category];
  return (
    <span title={`${Math.round(share * 100)}% of this sender's Gmail emails are in ${c.label}`}
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-subtle">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: c.color }} />{c.label}
    </span>
  );
}

/** An inbox the sender's emails are in, linking to its webmail searched for the sender. */
function InboxLink({ share, sender, toast, label, showCount }: {
  share: AccountShare; sender: string; toast: (msg: string, kind?: "ok" | "err") => void; label?: string; showCount: boolean;
}) {
  const p = providerInfo(share.provider);
  const link = mailboxLink(share.provider, share.email, sender);
  const body = (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
      <span className="truncate">{label ?? share.email}</span>
      {showCount && <span className="text-subtle tabular-nums">{fmtNum(share.count)}</span>}
    </>
  );
  const cls = "inline-flex max-w-[220px] items-center gap-1.5 rounded px-1 text-xs text-ink/80";
  if (!link) return <span title={`${p.label}: ${share.email}`} className={cls}>{body}</span>;
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-muted hover:text-accent`}
      title={link.search ? `${share.email} — open ${p.label} showing emails from ${sender}` : `${share.email} — open ${p.label}; the address is copied for search`}
      onClick={() => { if (!link.search) copyText(sender).then((ok) => ok && toast(`Copied ${sender} — paste it into ${p.label} search`)); }}>
      {body}
    </a>
  );
}

/** Unsubscribe button, "Unsubscribed", or a hint that the sender offers no link. */
function UnsubCell({ r, busy, onUnsub, reveal }: { r: Sender; busy: string | null; onUnsub: (email: string) => void; reveal?: boolean }) {
  if (r.unsubscribed) {
    return <span className="inline-flex items-center gap-1 px-1.5 text-xs font-medium text-ok">✓ Unsubscribed</span>;
  }
  if (!r.can_unsub) {
    // On phone cards the missing button says enough.
    if (!reveal) return null;
    return <span tabIndex={0} title="This sender's emails don't include an unsubscribe link. Trash them, or use Always trash."
      className={`cursor-help px-1.5 text-xs text-subtle/70 ${reveal ? "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" : ""}`}>No unsubscribe link</span>;
  }
  return (
    <button type="button" disabled={!!busy} onClick={() => onUnsub(r.email)}
      className={`h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${reveal ? "md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 md:group-focus-within:opacity-100" : ""}`}>
      {busy === `unsub:${r.email}` ? "…" : "Unsubscribe"}
    </button>
  );
}

function TrashButton({ name, disabled, onClick, reveal }: { name: string; disabled: boolean; onClick: () => void; reveal?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title="Trash all from this sender" aria-label={`Trash all from ${name}`}
      className={`grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-[#e8762b]/12 hover:text-[#b4501a] disabled:opacity-50 dark:hover:text-[#f0a06a] ${reveal ? "md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 md:group-focus-within:opacity-100" : ""}`}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </svg>
    </button>
  );
}

const HUES = [210, 340, 160, 30, 270, 190, 10, 120];

export function Avatar({ name }: { name: string }) {
  const h = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold"
      style={{ background: `hsl(${h} 70% 50% / 0.15)`, color: `hsl(${h} 60% 45%)` }}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

const FULL_KEY = "mailclean-account-labels";

/** Short account names by default; the choice is remembered. */
function useFullAccountLabels(): [boolean, (v: boolean) => void] {
  const [full, setFull] = useState(false);
  useEffect(() => {
    try { setFull(localStorage.getItem(FULL_KEY) === "full"); } catch { /* default */ }
  }, []);
  const update = (v: boolean) => {
    setFull(v);
    try { localStorage.setItem(FULL_KEY, v ? "full" : "short"); } catch { /* not saved */ }
  };
  return [full, update];
}
