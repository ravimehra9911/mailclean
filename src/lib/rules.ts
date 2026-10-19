// Clean-up rules ("Auto Clean"): trash or archive matching emails automatically after every sync.
// Starred and important emails are always kept.
import crypto from "node:crypto";
import { db, getAccount, isGmailCategory, listAccounts, type GmailCategory } from "./db";
import { applyLocally, type CleanAction } from "./actions";
import { moveMessages, startSync } from "./accounts";
import { isDemo } from "./demo";

export interface Rule {
  id: string;
  sender: string | null;
  category: GmailCategory | null;
  older_than_days: number;
  action: CleanAction;
  enabled: number;
  created_at: number;
  last_run_at: number | null;
  cleaned: number;
}

export type RuleInput = Pick<Rule, "sender" | "category" | "older_than_days" | "action">;

/** Validates a rule from a request; returns null if it is not usable. */
export function parseRule(body: Record<string, unknown>): RuleInput | null {
  const sender = typeof body.sender === "string" && /^[^\s@]+@[^\s@]+$/.test(body.sender.trim()) && body.sender.length <= 320
    ? body.sender.trim().toLowerCase() : null;
  const category = isGmailCategory(body.category) ? body.category : null;
  const days = Number(body.older_than_days ?? 0);
  const action = body.action === "archive" ? "archive" : body.action === "trash" ? "trash" : null;
  if ((!sender && !category) || (sender && category) || !action || !Number.isInteger(days) || days < 0 || days > 3650) return null;
  return { sender, category, older_than_days: days, action };
}

/** SQL for the emails a rule would move now (optionally in one account). */
function ruleQuery(r: RuleInput, accountId?: string, what = "m.account_id, m.msg_id") {
  const conds = ["m.starred = 0", "m.important = 0"];
  const args: (string | number)[] = [];
  if (r.sender) { conds.push("m.from_email = ?"); args.push(r.sender); }
  if (r.category) { conds.push("m.category = ?"); args.push(r.category); }
  if (r.older_than_days) { conds.push("m.date < ?"); args.push(Date.now() - r.older_than_days * 86_400_000); }
  if (r.action === "archive") conds.push("m.in_inbox = 1");
  if (accountId) { conds.push("m.account_id = ?"); args.push(accountId); }
  return { sql: `SELECT ${what} FROM messages m WHERE ${conds.join(" AND ")}`, args };
}

/** How many emails a rule matches right now. */
export function matching(r: RuleInput, exclude: string[] = []): number {
  const q = ruleQuery(r, undefined, "COUNT(*) n");
  const sql = exclude.length ? `${q.sql} AND m.from_email NOT IN (${exclude.map(() => "?").join(",")})` : q.sql;
  return (db().prepare(sql).get(...q.args, ...exclude) as { n: number }).n;
}

export function listRules(): (Rule & { matching: number })[] {
  return (db().prepare("SELECT * FROM rules ORDER BY created_at").all() as unknown as Rule[]).map((r) => ({ ...r, matching: matching(r) }));
}

export function addRule(r: RuleInput): string {
  // The same rule twice is one rule.
  const same = db().prepare(`SELECT id FROM rules WHERE sender IS ? AND category IS ? AND older_than_days = ? AND action = ?`)
    .get(r.sender, r.category, r.older_than_days, r.action) as { id: string } | undefined;
  if (same) { db().prepare("UPDATE rules SET enabled = 1 WHERE id = ?").run(same.id); return same.id; }
  const id = crypto.randomUUID();
  db().prepare(`INSERT INTO rules (id, sender, category, older_than_days, action, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, r.sender, r.category, r.older_than_days, r.action, Date.now());
  return id;
}

export const setRuleEnabled = (id: string, enabled: boolean) => db().prepare("UPDATE rules SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
export const deleteRule = (id: string) => db().prepare("DELETE FROM rules WHERE id = ?").run(id);

const running = ((globalThis as { __mailcleanRules?: Set<string> }).__mailcleanRules ??= new Set());

/**
 * Applies the enabled rules (to one account, or all) and returns how many emails each moved.
 * Called after every completed sync and from "Run rules now".
 */
export async function runRules(accountId?: string): Promise<{ count: number; errors: string[] }> {
  const key = accountId ?? "*";
  if (isDemo() || running.has(key)) return { count: 0, errors: [] };
  running.add(key);
  try {
    const rules = db().prepare("SELECT * FROM rules WHERE enabled = 1 ORDER BY created_at").all() as unknown as Rule[];
    let count = 0;
    const errors: string[] = [];
    for (const r of rules) {
      const q = ruleQuery(r, accountId);
      const rows = db().prepare(q.sql).all(...q.args) as { account_id: string; msg_id: string }[];
      const byAccount = new Map<string, string[]>();
      for (const row of rows) byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row.msg_id]);
      let moved = 0;
      for (const [accId, ids] of byAccount) {
        const acc = getAccount(accId);
        if (!acc) continue;
        try {
          await moveMessages(acc, ids, r.action);
          applyLocally(accId, ids, r.action);
          moved += ids.length;
        } catch (e) {
          errors.push(`${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      db().prepare("UPDATE rules SET last_run_at = ?, cleaned = cleaned + ? WHERE id = ?").run(Date.now(), moved, r.id);
      count += moved;
    }
    return { count, errors };
  } finally {
    running.delete(key);
  }
}

const AUTO_SYNC_EVERY = 6 * 3600_000;

/**
 * While the app is open and at least one rule is on, rescan accounts every 6 hours so rules also catch
 * new mail without a manual Sync (rules run after each sync).
 */
export function ensureAutoSync() {
  const g = globalThis as { __mailcleanAutoSync?: NodeJS.Timeout };
  if (isDemo() || g.__mailcleanAutoSync) return;
  g.__mailcleanAutoSync = setInterval(() => {
    const on = db().prepare("SELECT 1 FROM rules WHERE enabled = 1 LIMIT 1").get();
    if (!on) return;
    for (const a of listAccounts()) {
      if (a.sync_status !== "syncing" && (!a.last_sync_at || Date.now() - a.last_sync_at > AUTO_SYNC_EVERY)) startSync(a.id);
    }
  }, 15 * 60_000);
  g.__mailcleanAutoSync.unref?.();
}
