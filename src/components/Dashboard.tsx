"use client";

import { useCallback, useEffect, useState } from "react";
import { isImapProvider, providerInfo, type ImapProviderId } from "@/lib/catalog";
import { AddAccount, ProviderIcon } from "./AddAccount";
import { api, fmtBytes, fmtNum, pct, type Account, type Overview } from "./api";
import { AccountChip, SendersTable } from "./SendersTable";
import { VolumeChart } from "./VolumeChart";

type Tab = "overview" | "senders" | "newsletters" | "accounts" | "about";
type Toast = { msg: string; kind: "ok" | "err" } | null;

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [configured, setConfigured] = useState({ google: false, microsoft: false });
  const [about, setAbout] = useState({ version: "", dataDir: "" });
  const [accountId, setAccountId] = useState("");
  const [ov, setOv] = useState<Overview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastState, setToast] = useState<Toast>(null);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 6000);
  }, []);

  const loadAccounts = useCallback(async () => {
    const r = await api<{ accounts: Account[]; configured: typeof configured; about: typeof about }>("/api/accounts");
    setAccounts(r.accounts);
    setConfigured(r.configured);
    setAbout(r.about);
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

  // Refresh when the window regains focus, e.g. after finishing sign-in in the system browser.
  useEffect(() => {
    const onFocus = () => { loadAccounts(); refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAccounts, refresh]);

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
            ["about", "Privacy & about"],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${tab === t ? "bg-muted font-medium" : "text-subtle hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 md:px-8">
        {tab === "about" ? (
          <About {...about} />
        ) : accounts.length === 0 ? (
          <Welcome configured={configured} onConnected={changed} toast={toast} />
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold capitalize">{tab}</h1>
              {tab !== "accounts" && (
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="ml-auto h-9 rounded-lg border border-line bg-card px-2 text-sm">
                  <option value="">All accounts ({accounts.length})</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{providerInfo(a.provider).label} · {a.email}</option>)}
                </select>
              )}
            </header>

            {syncing && tab !== "accounts" && <SyncBanner accounts={accounts} />}
            {tab === "overview" && accounts.filter((a) => a.notice && (!accountId || a.id === accountId)).map((a) => (
              <div key={a.id} className="mb-6 rounded-xl border border-[#b7791f]/40 bg-[#b7791f]/10 px-5 py-3 text-sm">
                <b>{a.email}:</b> {a.notice}
              </div>
            ))}

            {tab === "overview" && ov && (
              <div className="space-y-6">
                <Summary ov={ov} onMostlyUnread={() => setTab("senders")} />
                {!accountId && ov.byAccount.length > 1 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ov.byAccount.map((s) => (
                      <button key={s.account_id} onClick={() => setAccountId(s.account_id)}
                        className="rounded-xl border border-line bg-card px-5 py-4 text-left hover:border-accent">
                        <AccountChip share={s} showCount={false} />
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tabular-nums">{fmtNum(s.count)}</span>
                          <span className="text-sm text-subtle">emails · {fmtBytes(s.bytes)} · {pct(s.count ? s.unread / s.count : 0)} unread</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full" style={{ width: pct(ov.emails ? s.count / ov.emails : 0), background: providerInfo(s.provider).color }} />
                        </div>
                        <div className="mt-1 text-xs text-subtle">{pct(ov.emails ? s.count / ov.emails : 0)} of all your mail · click to view only this inbox</div>
                      </button>
                    ))}
                  </div>
                )}
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

type ConnectProps = {
  configured: { google: boolean; microsoft: boolean };
  onConnected: () => void;
  toast: (m: string, k?: "ok" | "err") => void;
};

function Welcome(props: ConnectProps) {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">All your inboxes. One clean-up.</h1>
        <p className="mx-auto mt-3 max-w-xl text-subtle">
          See which senders fill your Gmail, Yahoo, iCloud and other inboxes, unsubscribe from newsletters and trash
          thousands of emails in a click. Only sender, date and size are read — never subjects or message content —
          and everything stays on this device.
        </p>
      </div>
      <div className="mt-8 rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 font-semibold">Choose your email provider</h2>
        <AddAccount {...props} />
      </div>
    </div>
  );
}

function Accounts({ accounts, configured, reload, toast }: {
  accounts: Account[]; configured: { google: boolean; microsoft: boolean }; reload: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [preset, setPreset] = useState<{ provider: ImapProviderId; email: string } | null>(null);
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
        <h2 className="mb-3 font-semibold">{preset ? `Update the app password for ${preset.email}` : "Add an account"}</h2>
        <AddAccount key={preset ? `${preset.provider}:${preset.email}` : "new"} preset={preset} configured={configured}
          onConnected={() => { setPreset(null); reload(); }} toast={toast} />
      </section>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 last:border-0">
            <ProviderIcon icon={providerInfo(a.provider).icon} color={providerInfo(a.provider).color} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.email} <span className="text-xs font-normal text-subtle">· {providerInfo(a.provider).label}</span></div>
              <div className={`text-xs ${a.sync_status === "error" ? "text-danger" : "text-subtle"}`}>
                {a.sync_status === "syncing" ? `Scanning… ${fmtNum(a.synced)}${a.total ? ` / ~${fmtNum(a.total)}` : ""}`
                  : a.sync_status === "error" ? `Error: ${a.sync_error}`
                  : a.last_sync_at ? `${fmtNum(a.synced)} emails · scanned ${new Date(a.last_sync_at).toLocaleString("en-IN")}` : "Not scanned yet"}
              </div>
              {a.notice && <div className="mt-1 text-xs text-[#b7791f]">⚠ {a.notice}</div>}
            </div>
            {a.sync_status === "error" && isImapProvider(a.provider) && (
              <button onClick={() => { setPreset({ provider: a.provider as ImapProviderId, email: a.email }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">Update password</button>
            )}
            <button disabled={a.sync_status === "syncing"} onClick={() => resync(a)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">Rescan</button>
            <button onClick={() => disconnect(a)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-danger hover:bg-danger/10">Disconnect</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function About({ version, dataDir }: { version: string; dataDir: string }) {
  const item = "rounded-xl border border-line bg-card p-5";
  return (
    <div className="max-w-3xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy &amp; about</h1>
      <section className={item}>
        <h2 className="mb-2 font-semibold">What MailClean reads</h2>
        <p className="text-subtle">
          For each email only the sender, date, size, read/inbox status and the sender&apos;s unsubscribe link are read.
          Subjects, message text and attachments are never downloaded.
        </p>
      </section>
      <section className={item}>
        <h2 className="mb-2 font-semibold">Where your data lives</h2>
        <p className="text-subtle">
          Everything stays on this device. There is no MailClean server or account, and nothing is sent anywhere except
          directly to your email provider. Passwords and sign-in tokens are encrypted (AES-256-GCM).
        </p>
        {dataDir && <p className="mt-2 break-all font-mono text-xs text-subtle">{dataDir}</p>}
      </section>
      <section className={item}>
        <h2 className="mb-2 font-semibold">What it changes</h2>
        <p className="text-subtle">
          Only what you click: <b>Move to Trash</b> moves mail to your provider&apos;s Trash (restorable there for about 30 days),
          <b> Archive</b> removes it from the inbox, and <b>Unsubscribe</b> uses the sender&apos;s own unsubscribe link.
          Nothing is ever permanently deleted.
        </p>
      </section>
      <section className={item}>
        <h2 className="mb-2 font-semibold">Removing your data</h2>
        <p className="text-subtle">
          <b>Accounts → Disconnect</b> deletes that account&apos;s password and scanned data from this device. Also delete the
          app password at your provider (Google, Yahoo, Apple…) to revoke access completely.
        </p>
      </section>
      <p className="text-xs text-subtle">MailClean {version}</p>
    </div>
  );
}
