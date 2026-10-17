"use client";

import { useCallback, useEffect, useState } from "react";
import { mailboxLink, providerInfo } from "@/lib/catalog";
import { api, fmtBytes, fmtDate, fmtNum, pct, type AccountShare, type Sender } from "./api";
import { rangeParams, type DateRange } from "./DateFilter";
import { BulkUnsubscribe } from "./BulkUnsubscribe";

type Filter = "all" | "newsletters" | "mostly-unread";
type Sort = "name" | "account" | "count" | "bytes" | "unread" | "last";
type Dir = "asc" | "desc";

export function SendersTable(props: {
  accountId: string;
  range: DateRange;
  initialFilter?: Filter;
  pageSize?: number;
  compact?: boolean;
  refreshKey: number;
  onChanged: () => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const { accountId, range, compact, pageSize = 25, refreshKey, onChanged, toast } = props;
  const [filter, setFilter] = useState<Filter>(props.initialFilter ?? "all");
  const [sort, setSort] = useState<{ by: Sort; dir: Dir }>({ by: "count", dir: "desc" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Sender[]; total: number }>({ rows: [], total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [unsubFor, setUnsubFor] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ sort: sort.by, dir: sort.dir, filter, limit: String(pageSize), offset: String(page * pageSize) });
    if (accountId) p.set("account", accountId);
    if (q) p.set("q", q);
    rangeParams(p, range);
    setData(await api(`/api/senders?${p}`));
  }, [accountId, range, sort, filter, q, page, pageSize]);

  useEffect(() => { load().catch((e) => toast(e.message, "err")); }, [load, refreshKey, toast]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [accountId, range, filter, sort, q]);

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

  async function clean(emails: string[], action: "trash" | "archive") {
    const rows = data.rows.filter((r) => emails.includes(r.email));
    const n = rows.reduce((a, r) => a + (action === "archive" ? r.inbox : r.count), 0);
    const verb = action === "trash" ? "Move to Trash" : "Archive";
    if (!confirm(`${verb} ${fmtNum(n)} emails from ${emails.length} sender${emails.length > 1 ? "s" : ""}?` +
      (action === "trash" ? "\n\nTrashed mail can be restored for 30 days." : ""))) return;
    setBusy(action);
    try {
      const r = await api<{ count: number; errors: string[] }>("/api/clean", {
        method: "POST", json: { senders: emails, action, accountId: accountId || undefined, from: range.from, to: range.to },
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sender…"
            className="h-9 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none focus:border-accent sm:w-64"
          />
          {(["all", "newsletters", "mostly-unread"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-9 rounded-full border px-3 text-sm ${filter === f ? "border-accent bg-accent text-white" : "border-line bg-card hover:bg-muted"}`}>
              {f === "all" ? "All senders" : f === "newsletters" ? "Newsletters" : "Mostly unread"}
            </button>
          ))}
        </div>
      )}

      {unsubFor && (
        <BulkUnsubscribe senders={unsubFor} onClose={() => setUnsubFor(null)}
          onDone={() => { setSelected(new Set()); onChanged(); }} />
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-white shadow-lg">
          <span><b>{selected.size}</b> senders · {fmtNum(selCount)} emails · {fmtBytes(selBytes)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button disabled={!!busy} onClick={() => setUnsubFor([...selected])}
              className="rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 disabled:opacity-50">Unsubscribe</button>
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

      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[860px] text-sm [&_td]:whitespace-nowrap">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
            <tr data-tour="sort-headers">
              <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all" /></th>
              {th("name", "Sender")}
              {th("account", "Account")}
              {th("count", "Emails", "right")}
              {th("bytes", "Size", "right")}
              {th("unread", "Unread", "right")}
              {!compact && th("last", "Last")}
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, rowIndex) => {
              const unreadRate = r.count ? r.unread / r.count : 0;
              return (
                <tr key={r.email} className={`border-b border-line last:border-0 ${selected.has(r.email) ? "bg-accent/5" : "hover:bg-muted"}`}>
                  <td className="px-3 py-2.5" data-tour={rowIndex === 0 ? "select" : undefined}><input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} /></td>
                  <td className="w-full max-w-0 min-w-[220px] px-2 py-2.5" style={{ whiteSpace: "normal" }}>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name || r.email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.name || r.email}</div>
                        <div className="flex min-w-0 items-center text-xs text-subtle">
                          <span className="truncate">{r.email}</span>
                          <CopyButton text={r.email} toast={toast} />
                          <SearchButton sender={r.email} shares={r.byAccount} toast={toast} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      {r.byAccount.map((s) => <AccountChip key={s.account_id} share={s} showCount={r.byAccount.length > 1} sender={r.email} toast={toast} />)}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-medium">{fmtNum(r.count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-subtle">{fmtBytes(r.bytes)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <span className={unreadRate >= 0.9 ? "font-medium text-danger" : "text-subtle"}>{pct(unreadRate)}</span>
                  </td>
                  {!compact && <td className="px-2 py-2.5 text-subtle">{fmtDate(r.last)}</td>}
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5" data-tour={rowIndex === 0 ? "row-actions" : undefined}>
                      {r.can_unsub > 0 && (r.unsubscribed ? (
                        <span className="rounded-md px-2 py-1 text-xs text-ok">✓ Unsubscribed</span>
                      ) : (
                        <button disabled={!!busy} onClick={() => unsub(r.email)}
                          className="rounded-md border border-line px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                          {busy === `unsub:${r.email}` ? "…" : "Unsubscribe"}
                        </button>
                      ))}
                      <button disabled={!!busy} onClick={() => clean([r.email], "trash")}
                        className="rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50">
                        Trash all
                      </button>
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

/**
 * Shows which connected inbox an email count belongs to, e.g. "G you@gmail.com · 120".
 * With `sender`, it links to that inbox's web mail, searching for the sender's emails.
 */
export function AccountChip({ share, showCount = true, sender, toast }: {
  share: Pick<AccountShare, "provider" | "email"> & { count?: number };
  showCount?: boolean;
  sender?: string;
  toast?: (msg: string, kind?: "ok" | "err") => void;
}) {
  const p = providerInfo(share.provider);
  const link = sender ? mailboxLink(share.provider, share.email, sender) : null;
  const body = (
    <>
      <span className="font-bold" style={{ color: p.color }}>{p.icon}</span>
      <span className="truncate">{share.email}</span>
      {showCount && share.count !== undefined && <span className="tabular-nums text-subtle">· {fmtNum(share.count)}</span>}
      {link && <span aria-hidden className="text-subtle">↗</span>}
    </>
  );
  const cls = "inline-flex max-w-[250px] items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-xs";
  if (!link || !sender) return <span title={`${p.label}: ${share.email}`} className={cls}>{body}</span>;
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      title={link.search ? `Open ${p.label} (${share.email}) showing emails from ${sender}` : `Open ${p.label} — the sender's address is copied for search`}
      onClick={() => {
        // No search link for this provider: copy the address so it can be pasted into the provider's search box.
        if (!link.search) copyText(sender).then((ok) => ok && toast?.(`Copied ${sender} — paste it into ${p.label} search`));
      }}
      className={`${cls} hover:border-accent hover:text-accent`}>
      {body}
    </a>
  );
}

function SortHeader({ label, active, dir, align, onClick }: {
  label: string; active: boolean; dir: Dir; align: "left" | "right"; onClick: () => void;
}) {
  return (
    <th className={`px-2 py-2.5 ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={onClick} title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${active ? "text-ink" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <svg viewBox="0 0 10 14" className="h-3 w-2.5" aria-hidden>
          <path d="M5 1 L9 5.5 H1 Z" fill="currentColor" opacity={active && dir === "asc" ? 1 : 0.25} />
          <path d="M5 13 L9 8.5 H1 Z" fill="currentColor" opacity={active && dir === "desc" ? 1 : 0.25} />
        </svg>
      </button>
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
