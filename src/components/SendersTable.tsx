"use client";

import { useCallback, useEffect, useState } from "react";
import { providerInfo } from "@/lib/catalog";
import { api, fmtBytes, fmtDate, fmtNum, pct, type AccountShare, type Sender } from "./api";

type Filter = "all" | "newsletters" | "mostly-unread";
type Sort = "count" | "bytes" | "unread" | "last";

export function SendersTable(props: {
  accountId: string;
  initialFilter?: Filter;
  pageSize?: number;
  compact?: boolean;
  refreshKey: number;
  onChanged: () => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const { accountId, compact, pageSize = 25, refreshKey, onChanged, toast } = props;
  const [filter, setFilter] = useState<Filter>(props.initialFilter ?? "all");
  const [sort, setSort] = useState<Sort>("count");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: Sender[]; total: number }>({ rows: [], total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ sort, filter, limit: String(pageSize), offset: String(page * pageSize) });
    if (accountId) p.set("account", accountId);
    if (q) p.set("q", q);
    setData(await api(`/api/senders?${p}`));
  }, [accountId, sort, filter, q, page, pageSize]);

  useEffect(() => { load().catch((e) => toast(e.message, "err")); }, [load, refreshKey, toast]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [accountId, filter, sort, q]);

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
        method: "POST", json: { senders: emails, action, accountId: accountId || undefined },
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
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
            className="ml-auto h-9 rounded-lg border border-line bg-card px-2 text-sm">
            <option value="count">Most emails</option>
            <option value="bytes">Most storage</option>
            <option value="unread">Most unread</option>
            <option value="last">Most recent</option>
          </select>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-white shadow-lg">
          <span><b>{selected.size}</b> senders · {fmtNum(selCount)} emails · {fmtBytes(selBytes)}</span>
          <div className="ml-auto flex gap-2">
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
            <tr>
              <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all" /></th>
              <th className="px-2 py-2.5">Sender</th>
              <th className="px-2 py-2.5">Account</th>
              <th className="px-2 py-2.5 text-right">Emails</th>
              <th className="px-2 py-2.5 text-right">Size</th>
              <th className="px-2 py-2.5 text-right">Unread</th>
              {!compact && <th className="px-2 py-2.5">Last</th>}
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const unreadRate = r.count ? r.unread / r.count : 0;
              return (
                <tr key={r.email} className={`border-b border-line last:border-0 ${selected.has(r.email) ? "bg-accent/5" : "hover:bg-muted"}`}>
                  <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.email)} onChange={() => toggle(r.email)} aria-label={`Select ${r.email}`} /></td>
                  <td className="w-full max-w-0 min-w-[220px] px-2 py-2.5" style={{ whiteSpace: "normal" }}>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name || r.email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.name || r.email}</div>
                        <div className="truncate text-xs text-subtle">
                          {r.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      {r.byAccount.map((s) => <AccountChip key={s.account_id} share={s} showCount={r.byAccount.length > 1} />)}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-medium">{fmtNum(r.count)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-subtle">{fmtBytes(r.bytes)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <span className={unreadRate >= 0.9 ? "font-medium text-danger" : "text-subtle"}>{pct(unreadRate)}</span>
                  </td>
                  {!compact && <td className="px-2 py-2.5 text-subtle">{fmtDate(r.last)}</td>}
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
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

/** Shows which connected inbox an email count belongs to, e.g. "G you@gmail.com · 120". */
export function AccountChip({ share, showCount = true }: { share: Pick<AccountShare, "provider" | "email"> & { count?: number }; showCount?: boolean }) {
  const p = providerInfo(share.provider);
  return (
    <span title={`${p.label}: ${share.email}`}
      className="inline-flex max-w-[230px] items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-xs">
      <span className="font-bold" style={{ color: p.color }}>{p.icon}</span>
      <span className="truncate">{share.email}</span>
      {showCount && share.count !== undefined && <span className="tabular-nums text-subtle">· {fmtNum(share.count)}</span>}
    </span>
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
