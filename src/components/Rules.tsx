"use client";

// Rules page: clean-ups that run by themselves after every sync ("Auto Clean").

import { useCallback, useEffect, useState } from "react";
import { api, fmtNum } from "./api";
import { CATEGORY_INFO, type GmailCategory } from "./categories";

interface Rule {
  id: string;
  sender: string | null;
  category: GmailCategory | null;
  older_than_days: number;
  action: "trash" | "archive";
  enabled: number;
  last_run_at: number | null;
  cleaned: number;
  matching: number;
}

const AGES = [[0, "any age"], [7, "older than a week"], [30, "older than 30 days"], [90, "older than 3 months"], [365, "older than a year"]] as const;

/** "Trash emails from deals@shop.com older than 30 days" */
export function describeRule(r: Pick<Rule, "sender" | "category" | "older_than_days" | "action">) {
  const what = r.sender ? <>emails from <b>{r.sender}</b></> : <>emails in Gmail <b>{CATEGORY_INFO[r.category!].label}</b></>;
  const age = AGES.find(([d]) => d === r.older_than_days)?.[1] ?? `older than ${r.older_than_days} days`;
  return <>{r.action === "trash" ? "Move" : "Archive"} {what}{r.older_than_days ? <> {age}</> : null}{r.action === "trash" ? " to Trash" : ""}</>;
}

export function RulesPage({ categories, demo, onChanged, toast }: {
  categories: GmailCategory[]; demo: boolean; onChanged: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [senders, setSenders] = useState<string[]>([]);
  const [form, setForm] = useState({ kind: "sender" as "sender" | "category", sender: "", category: (categories[0] ?? "promotions") as GmailCategory,
    action: "trash" as "trash" | "archive", days: 0 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ rules: Rule[] }>("/api/rules").then((r) => setRules(r.rules)).catch((e) => toast(e.message, "err")), [toast]);
  useEffect(() => { load(); }, [load]);
  // Suggest the biggest senders in the sender box.
  useEffect(() => {
    api<{ rows: { email: string }[] }>("/api/senders?limit=200&sort=count&dir=desc").then((r) => setSenders(r.rows.map((x) => x.email))).catch(() => {});
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/rules", { method: "POST", json: {
        action: form.action, older_than_days: form.days,
        ...(form.kind === "sender" ? { sender: form.sender } : { category: form.category }),
      } });
      setForm((f) => ({ ...f, sender: "" }));
      toast("Rule added — it runs after every sync");
      load();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  }

  async function toggle(r: Rule) {
    await api(`/api/rules/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } });
    load();
  }

  async function remove(r: Rule) {
    await api(`/api/rules/${r.id}`, { method: "DELETE" });
    load();
  }

  async function runNow() {
    const total = rules?.filter((r) => r.enabled).reduce((a, r) => a + r.matching, 0) ?? 0;
    if (!confirm(`Run your rules now? They match ${fmtNum(total)} emails.\n\nStarred and important emails are kept. Trashed mail can be restored for 30 days.`)) return;
    setBusy(true);
    try {
      const r = await api<{ count: number; errors: string[]; demo?: boolean }>("/api/rules/run", { method: "POST" });
      toast(r.demo ? `Demo: your rules would move ${fmtNum(r.count)} emails. In the app they run after every sync.`
        : `Rules moved ${fmtNum(r.count)} emails` + (r.errors.length ? ` — ${r.errors.join("; ")}` : ""), r.errors.length ? "err" : "ok");
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 rounded-lg border border-line bg-card px-2 text-sm outline-none focus:border-accent";
  const active = rules?.filter((r) => r.enabled).length ?? 0;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-card px-5 py-4 text-sm leading-relaxed text-subtle">
        Rules clean up for you: every time MailClean syncs — and every 6 hours while it&apos;s open — matching emails are moved to Trash or archived.
        {" "}<b className="text-ink">Starred and important emails are always kept.</b>
        {demo && <> In this demo, rules are saved in your browser and never change the sample data.</>}
      </section>

      <form onSubmit={add} className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 font-semibold">New rule</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as "trash" | "archive" })} className={input}>
            <option value="trash">Move to Trash</option>
            <option value="archive">Archive</option>
          </select>
          <select aria-label="Match" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "sender" | "category" })} className={input}>
            <option value="sender">emails from</option>
            {categories.length > 0 && <option value="category">emails in Gmail tab</option>}
          </select>
          {form.kind === "sender" ? (
            <>
              <input required type="email" list="rule-senders" value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })}
                placeholder="sender@example.com" aria-label="Sender" className={`${input} w-64`} />
              <datalist id="rule-senders">{senders.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          ) : (
            <select aria-label="Gmail tab" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as GmailCategory })} className={input}>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_INFO[c].label}</option>)}
            </select>
          )}
          <select aria-label="Age" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} className={input}>
            {AGES.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
          </select>
          <button className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:opacity-90">Add rule</button>
        </div>
        <p className="mt-2 text-xs text-subtle">Tip: on the Senders page, select senders and click <b>Always trash</b> to block them in one step — handy when they have no unsubscribe link.</p>
      </form>

      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="font-semibold">Your rules</h2>
          <span className="text-sm text-subtle">{rules ? `${active} of ${rules.length} on` : ""}</span>
          <button onClick={runNow} disabled={busy || !active}
            className="ml-auto h-8 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
            {busy ? "Running…" : "Run rules now"}
          </button>
        </div>
        {rules?.length === 0 && <p className="px-5 py-8 text-center text-sm text-subtle">No rules yet. Add one above, or use “Always trash” on the Senders page.</p>}
        {rules?.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0 ${r.enabled ? "" : "opacity-60"}`}>
            <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? "Turn off" : "Turn on"}>
              <input type="checkbox" checked={!!r.enabled} onChange={() => toggle(r)} className="peer sr-only" aria-label="Rule on" />
              <span className="h-5 w-9 rounded-full bg-subtle/40 transition-colors peer-checked:bg-accent" />
              <span className="absolute left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </label>
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate">{describeRule(r)}</div>
              <div className="text-xs text-subtle">
                {fmtNum(r.matching)} emails match now
                {r.cleaned > 0 && <> · {fmtNum(r.cleaned)} cleaned so far</>}
                {r.last_run_at && <> · last run {new Date(r.last_run_at).toLocaleString("en-IN")}</>}
              </div>
            </div>
            <button onClick={() => remove(r)} className="rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-danger/10">Delete</button>
          </div>
        ))}
      </section>
    </div>
  );
}
