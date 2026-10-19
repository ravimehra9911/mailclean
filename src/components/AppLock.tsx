"use client";

// App lock: the PIN input, the lock screen (with "Forgot PIN?" → reset) and the settings card.

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { IconLock } from "./Icons";

export interface LockState { enabled: boolean; unlocked: boolean; waitMs: number; demo?: boolean }

export const getLock = () => api<LockState>("/api/lock");
const lockAction = (json: object) => api<{ ok: true }>("/api/lock", { method: "POST", json });

/** Six boxes backed by one numeric input, so typing, pasting and password managers all work. */
export function PinInput({ value, onChange, onComplete, autoFocus, disabled, label }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; autoFocus?: boolean; disabled?: boolean; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus && !disabled) ref.current?.focus(); }, [autoFocus, disabled]);
  return (
    <div className="relative inline-flex gap-2" onClick={() => ref.current?.focus()}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} aria-hidden
          className={`grid size-11 place-items-center rounded-lg border text-xl ${i === value.length && !disabled ? "border-accent" : "border-line"} bg-card`}>
          {value[i] ? "•" : ""}
        </span>
      ))}
      <input ref={ref} type="password" inputMode="numeric" autoComplete="off" maxLength={6} aria-label={label} disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete?.(v);
        }}
        className="absolute inset-0 h-full w-full cursor-text opacity-0" />
    </div>
  );
}

/** Full-screen lock: enter the PIN, or reset MailClean if it's forgotten. */
export function LockScreen({ onUnlocked }: { onUnlocked: (reset: boolean) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [forgot, setForgot] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { getLock().then((s) => s.waitMs && setWaitUntil(Date.now() + s.waitMs)).catch(() => {}); }, []);
  useEffect(() => {
    if (waitUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitUntil, now]);
  const waiting = waitUntil > now;

  async function unlock(v: string) {
    setBusy(true);
    try {
      await lockAction({ action: "unlock", pin: v });
      onUnlocked(false);
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      const s = await getLock().catch(() => null);
      if (s?.waitMs) setWaitUntil(Date.now() + s.waitMs);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await lockAction({ action: "reset", confirm });
      onUnlocked(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-bg px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><IconLock className="size-7" /></div>
        {!forgot ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold">MailClean is locked</h1>
            <p className="mt-1 text-sm text-subtle">Enter your 6-digit PIN</p>
            <div className="mt-6">
              <PinInput label="PIN" value={pin} onChange={(v) => { setPin(v); setError(null); }} onComplete={unlock} autoFocus disabled={busy || waiting} />
            </div>
            <p role="alert" className="mt-4 min-h-5 text-sm text-danger">
              {waiting ? `Too many wrong tries. Try again in ${Math.ceil((waitUntil - now) / 1000)} s.` : error}
            </p>
            <button onClick={() => { setForgot(true); setError(null); }} className="mt-4 text-sm text-subtle underline-offset-2 hover:text-ink hover:underline">
              Forgot PIN?
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-semibold">Reset MailClean?</h1>
            <p className="mt-3 text-left text-sm leading-relaxed text-subtle">
              Without the PIN, the only way in is to start fresh. This removes <b className="text-ink">every connected account, scanned email,
              rule and setting</b> from MailClean on this computer, and the PIN. Your mailboxes and emails are not changed — you can connect
              them again afterwards.
            </p>
            <label className="mt-5 block text-left text-sm">
              Type <b>RESET</b> to confirm
              <input value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} autoFocus
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 outline-none focus:border-danger" />
            </label>
            <p role="alert" className="mt-2 min-h-5 text-left text-sm text-danger">{error}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setForgot(false); setConfirm(""); setError(null); }} className="h-10 flex-1 rounded-lg border border-line font-medium hover:bg-muted">Back</button>
              <button onClick={reset} disabled={busy || confirm !== "RESET"}
                className="h-10 flex-1 rounded-lg bg-danger font-medium text-white hover:opacity-90 disabled:opacity-50">Reset MailClean</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Settings card on the Privacy page: turn the PIN on, change it, turn it off, or lock now. */
export function AppLockSettings({ onChange, toast }: { onChange: () => void; toast: (m: string, k?: "ok" | "err") => void }) {
  const [state, setState] = useState<LockState | null>(null);
  const [mode, setMode] = useState<"idle" | "setup" | "change" | "disable">("idle");
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => getLock().then(setState).catch(() => {});
  useEffect(() => { load(); }, []);
  const reset = () => { setMode("idle"); setCurrent(""); setPin(""); setAgain(""); setError(null); };

  async function save() {
    setError(null);
    if (mode !== "disable" && pin.length !== 6) return setError("The PIN must be 6 digits.");
    if (mode !== "disable" && pin !== again) return setError("The two PINs don't match.");
    try {
      if (mode === "setup") await lockAction({ action: "setup", pin });
      if (mode === "change") await lockAction({ action: "change", current, pin });
      if (mode === "disable") await lockAction({ action: "disable", current });
      toast(mode === "setup" ? "App lock is on — you'll need the PIN when MailClean opens" : mode === "change" ? "PIN changed" : "App lock is off");
      reset();
      await load();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function lockNow() {
    await lockAction({ action: "lock" }).catch(() => {});
    window.dispatchEvent(new Event("mailclean-locked"));
  }

  const row = "flex flex-wrap items-center gap-3";
  const btn = "h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted";
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-accent"><IconLock className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">App lock</h2>
          <p className="mt-0.5 text-subtle">
            {state?.demo ? "Not available in the web demo — download MailClean to use it."
              : state?.enabled ? "On — MailClean asks for your 6-digit PIN every time it opens."
              : "Ask for a 6-digit PIN every time MailClean opens, so others using this computer can't see your mail data."}
          </p>
          {!state?.demo && mode === "idle" && (
            <div className={`mt-3 ${row}`}>
              {state?.enabled ? (
                <>
                  <button onClick={lockNow} className={btn}>Lock now</button>
                  <button onClick={() => setMode("change")} className={btn}>Change PIN</button>
                  <button onClick={() => setMode("disable")} className={`${btn} text-danger`}>Turn off</button>
                </>
              ) : (
                <button onClick={() => setMode("setup")} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Set a PIN</button>
              )}
            </div>
          )}
          {mode !== "idle" && (
            <form onSubmit={(e) => { e.preventDefault(); save(); }} className="mt-4 space-y-4">
              {(mode === "change" || mode === "disable") && (
                <div><div className="mb-1.5 text-xs text-subtle">Current PIN</div><PinInput label="Current PIN" value={current} onChange={setCurrent} autoFocus /></div>
              )}
              {mode !== "disable" && (
                <>
                  <div><div className="mb-1.5 text-xs text-subtle">{mode === "change" ? "New PIN" : "New 6-digit PIN"}</div><PinInput label="New PIN" value={pin} onChange={setPin} autoFocus={mode === "setup"} /></div>
                  <div><div className="mb-1.5 text-xs text-subtle">Type it again</div><PinInput label="Repeat PIN" value={again} onChange={setAgain} /></div>
                </>
              )}
              {mode !== "disable" && (
                <p className="text-xs text-subtle">If you forget it, you can reset MailClean from the lock screen — that removes your connected accounts and scanned data from this computer (your mailboxes aren&apos;t changed).</p>
              )}
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className={row}>
                <button type="submit" className={`h-9 rounded-lg px-4 text-sm font-medium text-white hover:opacity-90 ${mode === "disable" ? "bg-danger" : "bg-accent"}`}>
                  {mode === "setup" ? "Turn on app lock" : mode === "change" ? "Change PIN" : "Turn off app lock"}
                </button>
                <button type="button" onClick={reset} className={btn}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
