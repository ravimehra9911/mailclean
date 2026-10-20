"use client";

import { useState } from "react";
import { IMAP_PROVIDERS, type ImapProviderId } from "@/lib/catalog";
import { api } from "./api";

type Toast = (m: string, k?: "ok" | "err") => void;

// Order shown in the picker.
const ORDER: ImapProviderId[] = ["gmail", "yahoo", "icloud", "aol", "zoho", "imap"];

/** Provider picker plus the app-password form for the chosen provider. */
export function AddAccount(props: {
  configured: { google: boolean };
  onConnected: () => void;
  toast: Toast;
  /** Pre-select a provider and email, e.g. to replace a revoked app password. */
  preset?: { provider: ImapProviderId; email: string } | null;
}) {
  const [chosen, setChosen] = useState<ImapProviderId | null>(props.preset?.provider ?? null);

  return (
    <div className="text-left">
      <div data-tour="providers" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {ORDER.map((id) => {
          const p = IMAP_PROVIDERS[id];
          return (
            <button key={id} data-tour={`provider-${id}`} onClick={() => setChosen(chosen === id ? null : id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                chosen === id ? "border-accent bg-accent/10" : "border-line bg-card hover:bg-muted"}`}>
              <ProviderIcon icon={p.icon} color={p.color} />
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>

      {props.configured.google && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
          <a href="/api/connect/google" className="text-accent hover:underline">Or connect Gmail with Google sign-in →</a>
        </div>
      )}

      {chosen && (
        <ImapForm key={chosen} provider={chosen} initialEmail={props.preset?.provider === chosen ? props.preset.email : ""}
          toast={props.toast} onDone={() => { setChosen(null); props.onConnected(); }} />
      )}
    </div>
  );
}

export function ProviderIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {icon}
    </span>
  );
}

function ImapForm({ provider, initialEmail, onDone, toast }: {
  provider: ImapProviderId; initialEmail: string; onDone: () => void; toast: Toast;
}) {
  const info = IMAP_PROVIDERS[provider];
  const custom = info.host === null;
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(info.host ?? "");
  const [port, setPort] = useState(String(info.port));
  const [username, setUsername] = useState("");
  const [advanced, setAdvanced] = useState(custom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ email: string }>("/api/connect/imap", {
        method: "POST",
        json: { provider, email, password, host, port, username: username || undefined },
      });
      setPassword("");
      toast(`Connected ${r.email} — scanning your mailbox…`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "h-10 w-full rounded-lg border border-line bg-card px-3 outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="mt-3 space-y-4 rounded-xl border border-line bg-muted/50 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ProviderIcon icon={info.icon} color={info.color} /> Connect {info.label}
      </div>

      <ol data-tour="steps" className="list-decimal space-y-1 pl-5 text-subtle">
        {info.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {"appPasswordUrl" in info && (
        <a data-tour="app-password-link" href={info.appPasswordUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-3 font-medium hover:bg-muted">
          Open {info.label} app passwords ↗
        </a>
      )}
      {"note" in info && <p className="text-xs text-subtle">{info.note}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        <label data-tour="email" className="space-y-1">
          <span className="text-xs text-subtle">Email address</span>
          <input type="email" required autoComplete="off" placeholder={info.placeholder} value={email}
            onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label data-tour="password" className="space-y-1">
          <span className="text-xs text-subtle">{custom ? "Password or app password" : "App password"}</span>
          <input type="password" required autoComplete="new-password" placeholder={custom ? "" : "xxxx xxxx xxxx xxxx"}
            value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>
      </div>

      {!custom && (
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs text-subtle hover:text-ink">
          {advanced ? "▾" : "▸"} Advanced (server settings)
        </button>
      )}
      {advanced && (
        <div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr]">
          <label className="space-y-1">
            <span className="text-xs text-subtle">IMAP server</span>
            <input required placeholder="imap.example.com" value={host} onChange={(e) => setHost(e.target.value)} className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-subtle">Port (SSL)</span>
            <input required inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={field} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-subtle">Username (if not your email)</span>
            <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
          </label>
        </div>
      )}

      {error && <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <button data-tour="connect" disabled={busy} className="h-10 rounded-lg bg-accent px-5 font-medium text-white disabled:opacity-60">
          {busy ? "Checking login…" : "Connect"}
        </button>
        <span className="text-xs text-subtle">🔒 Your password is encrypted and stays on this device.</span>
      </div>
    </form>
  );
}
