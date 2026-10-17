"use client";

// Bulk unsubscribe: shows what will happen to each selected sender, asks for confirmation, runs the
// one-click unsubscribes in the background, then lists the pages the user still needs to open.

import { useEffect, useState } from "react";
import { api } from "./api";

type Method = "one-click" | "link" | "mailto" | "none";
interface Plan { sender: string; name: string | null; method: Method; already: boolean }
interface Outcome { results: { sender: string; status: "done" | "failed" }[]; links: { sender: string; url: string }[] }

export function BulkUnsubscribe({ senders, onClose, onDone }: {
  senders: string[]; onClose: () => void; onDone: () => void;
}) {
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"confirm" | "working" | "result">("confirm");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<{ plan: Plan[] }>("/api/unsubscribe/preview", { method: "POST", json: { senders } })
      .then((r) => setPlan(r.plan))
      .catch((e) => setError((e as Error).message));
  }, [senders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase !== "working" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const auto = plan?.filter((p) => p.method === "one-click" && !p.already) ?? [];
  const web = plan?.filter((p) => (p.method === "link" || p.method === "mailto") && !p.already) ?? [];
  const none = plan?.filter((p) => p.method === "none") ?? [];
  const already = plan?.filter((p) => p.already && p.method !== "none") ?? [];
  const label = (s: string) => plan?.find((p) => p.sender === s)?.name || s;

  async function run() {
    setPhase("working");
    try {
      setOutcome(await api<Outcome>("/api/unsubscribe/bulk", { method: "POST", json: { senders: [...auto, ...web].map((p) => p.sender) } }));
      setPhase("result");
    } catch (e) {
      setError((e as Error).message);
      setPhase("confirm");
    }
  }

  function close() {
    if (outcome) onDone();
    onClose();
  }

  function markOpened(sender: string, url: string) {
    setOpened((o) => new Set(o).add(sender));
    fetch("/api/unsubscribe/opened", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender, url }) }).catch(() => {});
  }

  const done = outcome?.results.filter((r) => r.status === "done") ?? [];
  const links = outcome?.links ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm" onClick={() => phase !== "working" && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="bu-title" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
        <div className="border-b border-line px-6 py-4">
          <h2 id="bu-title" className="text-lg font-semibold">
            {phase === "result" ? "Unsubscribe results" : `Unsubscribe from ${senders.length} sender${senders.length === 1 ? "" : "s"}?`}
          </h2>
          {phase !== "result" && <p className="mt-1 text-sm text-subtle">Review what will happen before you confirm.</p>}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          {error && <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-danger">{error}</div>}
          {!plan && !error && <div className="py-6 text-center text-subtle">Checking senders…</div>}

          {plan && phase !== "result" && (
            <>
              <Group tone="ok" title="Unsubscribed automatically" note="These senders support one-click unsubscribe — MailClean does it for you."
                items={auto.map((p) => ({ key: p.sender, label: p.name || p.sender, sub: p.sender }))} />
              <Group tone="accent" title="Confirm on the sender's website" note="These senders need you to finish on their unsubscribe page. You'll get a button to open each one."
                items={web.map((p) => ({ key: p.sender, label: p.name || p.sender, sub: p.sender }))} />
              <Group tone="muted" title="No unsubscribe option" note="These senders don't offer unsubscribe. You can still move their emails to Trash."
                items={none.map((p) => ({ key: p.sender, label: p.name || p.sender, sub: p.sender }))} />
              <Group tone="muted" title="Already unsubscribed"
                items={already.map((p) => ({ key: p.sender, label: p.name || p.sender, sub: p.sender }))} />
            </>
          )}

          {phase === "result" && (
            <>
              {done.length > 0 && (
                <Group tone="ok" title={`✓ Unsubscribed from ${done.length}`}
                  items={done.map((r) => ({ key: r.sender, label: label(r.sender), sub: r.sender }))} />
              )}
              {links.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Finish on {links.length} website{links.length === 1 ? "" : "s"}</h3>
                    {links.length > 1 && (
                      <button onClick={() => links.forEach((l) => { window.open(l.url, "_blank", "noopener,noreferrer"); markOpened(l.sender, l.url); })}
                        className="text-xs font-medium text-accent hover:underline">Open all</button>
                    )}
                  </div>
                  <p className="mb-2 text-xs text-subtle">Each page opens in your browser — confirm the unsubscribe there.</p>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {links.map((l) => (
                      <li key={l.sender} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{label(l.sender)}</div>
                          <div className="truncate text-xs text-subtle">{l.sender}</div>
                        </div>
                        {opened.has(l.sender) ? (
                          <span className="text-xs text-ok">✓ Opened</span>
                        ) : (
                          <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => markOpened(l.sender, l.url)}
                            className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium hover:bg-muted">Open page ↗</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {done.length === 0 && links.length === 0 && <p className="text-subtle">Nothing more to do.</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
          {phase === "result" ? (
            <button onClick={close} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">Done</button>
          ) : (
            <>
              <button onClick={close} disabled={phase === "working"} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">Cancel</button>
              <button onClick={run} disabled={!plan || phase === "working" || auto.length + web.length === 0}
                className="h-9 rounded-lg bg-danger px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {phase === "working" ? "Unsubscribing…" : `Unsubscribe from ${auto.length + web.length}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, note, items, tone }: {
  title: string; note?: string; items: { key: string; label: string; sub: string }[]; tone: "ok" | "accent" | "muted";
}) {
  if (!items.length) return null;
  const dot = tone === "ok" ? "bg-ok" : tone === "accent" ? "bg-accent" : "bg-subtle/50";
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden /> {title}
        <span className="ml-auto rounded-full bg-muted px-2 py-px text-xs font-medium text-subtle tabular-nums">{items.length}</span>
      </h3>
      {note && <p className="mt-0.5 mb-2 text-xs text-subtle">{note}</p>}
      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/60 p-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-baseline gap-2 px-1">
            <span className="truncate font-medium">{i.label}</span>
            {i.label !== i.sub && <span className="truncate text-xs text-subtle">{i.sub}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
