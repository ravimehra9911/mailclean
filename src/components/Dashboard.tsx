"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtBytes, fmtNum, pct, type Account, type Overview } from "./api";
import { SendersTable } from "./SendersTable";
import { VolumeChart } from "./VolumeChart";

type Tab = "overview" | "senders" | "newsletters" | "accounts";
type Toast = { msg: string; kind: "ok" | "err" } | null;

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [configured, setConfigured] = useState({ google: false, microsoft: false });
  const [accountId, setAccountId] = useState("");
  const [ov, setOv] = useState<Overview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastState, setToast] = useState<Toast>(null);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 6000);
  }, []);

  const loadAccounts = useCallback(async () => {
    const r = await api<{ accounts: Account[]; configured: typeof configured }>("/api/accounts");
    setAccounts(r.accounts);
    setConfigured(r.configured);
    return r.accounts;
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Show the result of an OAuth redirect, then clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) toast(`Connected ${p.get("connected")} — scanning your mailbox…`);
    if (p.get("error")) toast(p.get("error")!, "err");
    if (p.size) window.history.replaceState(null, "", "/");
    loadAccounts();
  }, [loadAccounts, toast]);

  useEffect(() => {
    if (accounts?.length) {
      const p = accountId ? `?account=${accountId}` : "";
      api<Overview>(`/api/overview${p}`).then(setOv).catch((e) => toast(e.message, "err"));
    }
  }, [accounts?.length, accountId, refreshKey, toast]);

  // While any account is syncing, poll progress and refresh numbers.
  const syncing = accounts?.some((a) => a.sync_status === "syncing");
  useEffect(() => {
    if (!syncing) return;
    const t = setInterval(async () => { await loadAccounts(); refresh(); }, 2500);
    return () => clearInterval(t);
  }, [syncing, loadAccounts, refresh]);

  if (accounts === null) return <div className="grid min-h-screen place-items-center text-subtle">Loading…</div>;

  const changed = () => { refresh(); loadAccounts(); };

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">✦</span> MailClean
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {([
            ["overview", "Overview"],
            ["senders", "Senders"],
            ["newsletters", "Newsletters"],
            ["accounts", `Accounts (${accounts.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === t ? "bg-muted font-medium" : "text-subtle hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
        {accounts.length === 0 ? (
          <Welcome configured={configured} />
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold capitalize">{tab}</h1>
              {tab !== "accounts" && (
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="ml-auto h-9 rounded-lg border border-line bg-card px-2 text-sm">
                  <option value="">All accounts ({accounts.length})</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              )}
            </header>

            {syncing && tab !== "accounts" && <SyncBanner accounts={accounts} />}

            {tab === "overview" && ov && (
              <div className="space-y-6">
                <Summary ov={ov} onMostlyUnread={() => setTab("senders")} />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Emails" value={fmtNum(ov.emails)} />
                  <Stat label="Storage used" value={fmtBytes(ov.bytes)} />
                  <Stat label="Unread" value={pct(ov.emails ? ov.unread / ov.emails : 0)} sub={`${fmtNum(ov.unread)} emails`} />
                  <Stat label="Newsletters" value={fmtNum(ov.newsletters)} sub={`of ${fmtNum(ov.senders)} senders`} />
                </div>
                <Card title="Emails received" sub="per week, last 6 months">
                  <VolumeChart daily={ov.daily} />
                </Card>
                <Card title="Top senders" sub="who fills your inbox" action={<button onClick={() => setTab("senders")} className="text-sm text-accent">View all →</button>}>
                  <SendersTable accountId={accountId} compact pageSize={10} refreshKey={refreshKey} onChanged={changed} toast={toast} />
                </Card>
              </div>
            )}
            {tab === "senders" && <SendersTable accountId={accountId} refreshKey={refreshKey} onChanged={changed} toast={toast} />}
            {tab === "newsletters" && (
              <SendersTable key="nl" accountId={accountId} initialFilter="newsletters" refreshKey={refreshKey} onChanged={changed} toast={toast} />
            )}
            {tab === "accounts" && <Accounts accounts={accounts} configured={configured} reload={changed} toast={toast} />}
          </>
        )}
      </main>

      {toastState && (
        <div role="status" className={`fixed right-4 bottom-4 left-4 z-50 rounded-xl px-4 py-3 text-sm shadow-xl sm:left-auto sm:max-w-md ${toastState.kind === "err" ? "bg-danger text-white" : "bg-ink text-bg"}`}>
          {toastState.msg}
        </div>
      )}
    </div>
  );
}

function Summary({ ov, onMostlyUnread }: { ov: Overview; onMostlyUnread: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-card px-5 py-4 text-sm leading-relaxed">
      <b>{fmtNum(ov.emails)} emails</b> · ~{fmtBytes(ov.bytes)} · <b>{pct(ov.emails ? ov.unread / ov.emails : 0)} unread</b>
      {" · "}your top 10 senders are <b>{pct(ov.top10Share)}</b> of your mail
      {ov.mostlyUnreadSenders > 0 && <>{" · "}<button onClick={onMostlyUnread} className="font-medium text-danger underline-offset-2 hover:underline">
        {ov.mostlyUnreadSenders} senders are ≥90% unread →</button></>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-subtle">{sub}</div>}
    </div>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="font-semibold">{title}</h2>
        {sub && <span className="text-sm text-subtle">{sub}</span>}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

function SyncBanner({ accounts }: { accounts: Account[] }) {
  const s = accounts.filter((a) => a.sync_status === "syncing");
  const done = s.reduce((a, x) => a + x.synced, 0);
  const total = s.reduce((a, x) => a + x.total, 0);
  return (
    <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 px-5 py-3 text-sm">
      Scanning {s.map((a) => a.email).join(", ")} — {fmtNum(done)}{total ? ` of ~${fmtNum(total)}` : ""} emails.
      You can start cleaning senders found so far.
      {total > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/15"><div className="h-full bg-accent transition-all" style={{ width: pct(Math.min(1, done / total)) }} /></div>}
    </div>
  );
}

const PROVIDER_LABEL = { google: "Gmail", microsoft: "Outlook" } as const;

// Outlook support is built (src/lib/providers/microsoft.ts) but hidden for now; set to true to bring it back.
const SHOW_OUTLOOK = false;

function ConnectButtons({ configured }: { configured: { google: boolean; microsoft: boolean } }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/api/connect/google" className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-bg hover:opacity-90">
        <span className="font-bold text-[#ea4335]">G</span> Connect Gmail
      </a>
      {SHOW_OUTLOOK && (
        <a href="/api/connect/microsoft" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium hover:bg-muted">
          <span className="font-bold text-[#0078d4]">◼</span> Connect Outlook / Hotmail
        </a>
      )}
      {!configured.google && (
        <p className="w-full text-xs text-subtle">Gmail sign-in needs API keys in <code>.env.local</code> — see README.</p>
      )}
    </div>
  );
}

function Welcome({ configured }: { configured: { google: boolean; microsoft: boolean } }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-3xl font-semibold">All your Gmail inboxes. One clean-up.</h1>
      <p className="mt-3 text-subtle">
        Connect your Gmail accounts, see which senders fill them, unsubscribe from newsletters and trash
        thousands of emails in a click. Only email metadata is read — never subjects or content.
      </p>
      <div className="mt-8 flex justify-center"><ConnectButtons configured={configured} /></div>
    </div>
  );
}

function Accounts({ accounts, configured, reload, toast }: {
  accounts: Account[]; configured: { google: boolean; microsoft: boolean }; reload: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  async function disconnect(a: Account) {
    if (!confirm(`Disconnect ${a.email}? Its scanned data is deleted from MailClean. Your mailbox is not changed.`)) return;
    await api(`/api/accounts/${a.id}`, { method: "DELETE" });
    toast(`Disconnected ${a.email}`);
    reload();
  }
  async function resync(a: Account) {
    await api(`/api/accounts/${a.id}/sync`, { method: "POST" });
    reload();
  }
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 font-semibold">Add an account</h2>
        <ConnectButtons configured={configured} />
      </section>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 last:border-0">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{PROVIDER_LABEL[a.provider]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.email}</div>
              <div className={`text-xs ${a.sync_status === "error" ? "text-danger" : "text-subtle"}`}>
                {a.sync_status === "syncing" ? `Scanning… ${fmtNum(a.synced)}${a.total ? ` / ~${fmtNum(a.total)}` : ""}`
                  : a.sync_status === "error" ? `Error: ${a.sync_error}`
                  : a.last_sync_at ? `${fmtNum(a.synced)} emails · scanned ${new Date(a.last_sync_at).toLocaleString("en-IN")}` : "Not scanned yet"}
              </div>
            </div>
            <button disabled={a.sync_status === "syncing"} onClick={() => resync(a)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">Rescan</button>
            <button onClick={() => disconnect(a)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger hover:bg-danger/10">Disconnect</button>
          </div>
        ))}
      </div>
    </div>
  );
}
