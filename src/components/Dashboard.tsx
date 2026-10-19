"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isImapProvider, providerInfo, type ImapProviderId } from "@/lib/catalog";
import { AddAccount, ProviderIcon } from "./AddAccount";
import { ALL_TIME, DateFilter, rangeLabel, rangeParams, type DateRange } from "./DateFilter";
import { ThemeToggle } from "./ThemeToggle";
import { startTour, tourSeen, type TourKind } from "./Tour";
import { Sidebar, type Tab } from "./Sidebar";
import { AboutPage, HelpPage, PrivacyPage } from "./Pages";
import { IconRefresh } from "./Icons";
import { UpdateBanner, useUpdates } from "./Updates";
import { api, fmtNum, pct, type Account, type Overview } from "./api";
import { SendersTable, type KeepOptions } from "./SendersTable";
import { CategoryFilter, type GmailCategory } from "./categories";
import { VolumeChart } from "./VolumeChart";
import { RulesPage } from "./Rules";
import { CleanupNext, GmailTabsList, Headline } from "./OverviewCards";

type Toast = { msg: string; kind: "ok" | "err" } | null;

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  // Filter the Senders tab opens with (a cleaning suggestion can pick "Mostly unread").
  const [sendersFilter, setSendersFilter] = useState<"all" | "mostly-unread">("all");
  const openTab = useCallback((t: Tab) => { setSendersFilter("all"); setTab(t); }, []);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [configured, setConfigured] = useState({ google: false, microsoft: false });
  const [about, setAbout] = useState({ version: "", dataDir: "", demo: false });
  const updates = useUpdates();

  // Short account names for the senders table: the provider ("Gmail"), plus the part before "@"
  // when two accounts use the same provider ("Gmail · work").
  const accountLabels = useMemo(() => {
    const short = (p: string) => providerInfo(p).label.replace(/ Mail$/, "");
    const counts = new Map<string, number>();
    for (const a of accounts ?? []) counts.set(short(a.provider), (counts.get(short(a.provider)) ?? 0) + 1);
    return Object.fromEntries((accounts ?? []).map((a) => {
      const p = short(a.provider);
      return [a.email, (counts.get(p) ?? 0) > 1 ? `${p} · ${a.email.split("@")[0]}` : p];
    }));
  }, [accounts]);

  const runTour = useCallback(
    (kind: TourKind) => { startTour(kind, { setTab, hasAccounts: (accounts?.length ?? 0) > 0 }); },
    [accounts?.length],
  );

  // First launch: start the tour once the app has loaded.
  const loaded = accounts !== null;
  useEffect(() => {
    if (!loaded || tourSeen()) return;
    const t = setTimeout(() => runTour("intro"), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const [accountId, setAccountId] = useState("");
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [category, setCategory] = useState<GmailCategory | "">("");
  const [keep, setKeep] = useKeepOptions();
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
      const p = new URLSearchParams();
      if (accountId) p.set("account", accountId);
      if (category) p.set("category", category);
      rangeParams(p, range);
      api<Overview>(`/api/overview?${p}`).then(setOv).catch((e) => toast(e.message, "err"));
    }
  }, [accounts?.length, accountId, range, category, refreshKey, toast]);

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
      <Sidebar tab={tab} setTab={openTab} accountCount={accounts.length} version={about.version} demo={about.demo} />

      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 md:px-8">
        {about.demo && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-5 py-3 text-sm">
            <span><b>Live demo</b> with sample data — try the filters, sorting and clean-up. Your changes stay in this browser only.</span>
            <div className="flex gap-2 sm:ml-auto">
              <a href="/" className="rounded-lg border border-line bg-card px-3 py-1.5 font-medium hover:bg-muted">← Website</a>
              <a href="/#download" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">Download MailClean</a>
            </div>
          </div>
        )}
        <UpdateBanner info={updates.info} />
        {tab === "help" ? (
          <HelpPage onTour={runTour} />
        ) : tab === "privacy" ? (
          <PrivacyPage dataDir={about.dataDir} />
        ) : tab === "about" ? (
          <AboutPage version={about.version} updates={updates} />
        ) : accounts.length === 0 ? (
          <Welcome configured={configured} onConnected={changed} toast={toast} />
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold capitalize">{tab}</h1>
              {tab !== "accounts" && tab !== "rules" && (
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <DateFilter value={range} years={ov?.years ?? []} onChange={setRange} />
                  <CategoryFilter value={category} options={ov?.categories ?? []} onChange={setCategory} />
                  <select data-tour="account-filter" aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)}
                    className="h-9 rounded-lg border border-line bg-card px-2 text-sm">
                    <option value="">All accounts ({accounts.length})</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{providerInfo(a.provider).label} · {a.email}</option>)}
                  </select>
                  <SyncButton accounts={accountId ? accounts.filter((a) => a.id === accountId) : accounts} demo={about.demo}
                    onStarted={changed} toast={toast} />
                </div>
              )}
              <div className="md:hidden"><ThemeToggle /></div>
            </header>

            {syncing && tab !== "accounts" && tab !== "rules" && <SyncBanner accounts={accounts} />}
            {tab === "overview" && ov && (
              <div className="space-y-6">
                <Headline ov={ov} accounts={accounts} period={rangeLabel(range)} onAccount={setAccountId} />
                <div className={`grid gap-6 ${ov.categories.length ? "lg:grid-cols-5" : ""}`}>
                  <div className={ov.categories.length ? "lg:col-span-3" : ""}>
                    <CleanupNext ov={ov} onPick={(p) => {
                      if (p === "never-opened") { setSendersFilter("mostly-unread"); setTab("senders"); }
                      else if (p === "old") { setRange({ key: "custom", to: ov.suggestions.old.before }); openTab("senders"); }
                      else openTab("newsletters");
                    }} />
                  </div>
                  {ov.categories.length > 0 && (
                    <div className="lg:col-span-2"><GmailTabsList categories={ov.categories} selected={category} onSelect={setCategory} /></div>
                  )}
                </div>
                <Card title="Emails received" sub={`per week, ${rangeLabel(range) ?? "last 6 months"}`}>
                  <VolumeChart daily={ov.daily} />
                </Card>
                <Card title="Top senders" sub="who fills your inbox" action={<button onClick={() => openTab("senders")} className="text-sm text-accent">View all →</button>}>
                  <div data-tour="senders-table"><SendersTable accountId={accountId} accountLabels={accountLabels} range={range} category={category} keep={keep} compact pageSize={10} refreshKey={refreshKey} onChanged={changed} toast={toast} /></div>
                </Card>
              </div>
            )}
            {tab === "senders" && <SendersTable key={`s-${sendersFilter}`} initialFilter={sendersFilter} accountId={accountId} accountLabels={accountLabels} range={range} category={category}
              keep={keep} setKeep={setKeep} refreshKey={refreshKey} onChanged={changed} toast={toast} />}
            {tab === "newsletters" && (
              <SendersTable key="nl" accountId={accountId} accountLabels={accountLabels} range={range} category={category}
                keep={keep} setKeep={setKeep} initialFilter="newsletters" refreshKey={refreshKey} onChanged={changed} toast={toast} />
            )}
            {tab === "rules" && <RulesPage categories={(ov?.categories ?? []).map((c) => c.category)} demo={about.demo} onChanged={changed} toast={toast} />}
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

const KEEP_FLAGGED_KEY = "mailclean-keep-flagged";
const KEEP_NEWEST_KEY = "mailclean-keep-newest";

/** What clean-ups leave alone: starred & important (on by default) and the newest N per sender; remembered. */
function useKeepOptions(): [KeepOptions, (k: KeepOptions) => void] {
  const [keep, setKeep] = useState<KeepOptions>({ keepFlagged: true, keepNewest: 0 });
  useEffect(() => {
    try {
      setKeep({ keepFlagged: localStorage.getItem(KEEP_FLAGGED_KEY) !== "off", keepNewest: Number(localStorage.getItem(KEEP_NEWEST_KEY)) || 0 });
    } catch { /* defaults */ }
  }, []);
  const update = (k: KeepOptions) => {
    setKeep(k);
    try {
      localStorage.setItem(KEEP_FLAGGED_KEY, k.keepFlagged ? "on" : "off");
      localStorage.setItem(KEEP_NEWEST_KEY, String(k.keepNewest));
    } catch { /* not saved */ }
  };
  return [keep, update];
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

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * Rescans the shown accounts so changes made elsewhere (e.g. emails deleted in Gmail) are picked up.
 * Shows when the data was last synced.
 */
function SyncButton({ accounts, demo, onStarted, toast }: {
  accounts: Account[]; demo: boolean; onStarted: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const busy = accounts.some((a) => a.sync_status === "syncing");
  const times = accounts.map((a) => a.last_sync_at).filter((t): t is number => !!t);
  const last = times.length ? Math.min(...times) : null;

  async function sync() {
    if (demo) { toast("The demo uses sample data — in the app, Sync rescans your mailbox."); return; }
    try {
      await Promise.all(accounts.map((a) => api(`/api/accounts/${a.id}/sync`, { method: "POST" })));
      onStarted();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={sync} disabled={busy} title="Rescan your mailbox for new and deleted emails" data-tour="sync"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
        <IconRefresh className={`size-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Syncing…" : "Sync"}
      </button>
      {last && !busy && <span className="hidden text-xs text-subtle lg:inline">Synced {ago(last)}</span>}
    </div>
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
          thousands of emails in a click. Only sender, date and size are saved — never subject lines or message content —
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
        <h2 data-tour="add-account" className="mb-3 font-semibold">{preset ? `Update the app password for ${preset.email}` : "Add an account"}</h2>
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
