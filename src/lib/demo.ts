// Demo mode: sample data for the public web demo (Vercel) and for website screenshots.
// No real mailboxes are ever contacted in demo mode.
import crypto from "node:crypto";
import { db, insertMessages, type GmailCategory, type MessageMeta } from "./db";

/** True for the hosted web demo: MAILCLEAN_DEMO=1, or any Vercel deployment. */
export const isDemo = () => process.env.MAILCLEAN_DEMO === "1" || process.env.VERCEL === "1";

export const DEMO_MESSAGE = "This is the live demo with sample data — download MailClean to clean your own inbox.";

// Fictional senders: [name, address, emails/month, avg KB, unread rate, newsletter?, Gmail tab]
const SENDERS: [string, string, number, number, number, boolean, GmailCategory][] = [
  ["ShopKart Deals", "deals@shopkart.example", 34, 70, 0.96, true, "promotions"],
  ["FoodDash", "offers@fooddash.example", 30, 45, 0.97, true, "promotions"],
  ["Daily Tech Digest", "digest@techdigest.example", 30, 35, 0.92, true, "updates"],
  ["StyleHub", "hello@stylehub.example", 22, 85, 0.98, true, "promotions"],
  ["JobLink", "notifications@joblink.example", 24, 55, 0.74, true, "social"],
  ["Morning Read", "crew@morningread.example", 20, 90, 0.55, true, "updates"],
  ["TravelNest", "trips@travelnest.example", 12, 140, 0.88, true, "promotions"],
  ["StreamBox", "news@streambox.example", 6, 160, 0.7, true, "promotions"],
  ["CityCabs", "receipts@citycabs.example", 10, 60, 0.6, false, "purchases"],
  ["Q&A Weekly", "digest@qaweekly.example", 26, 40, 0.99, true, "forums"],
  ["PayWallet", "alerts@paywallet.example", 14, 35, 0.9, true, "updates"],
  ["LearnPath", "courses@learnpath.example", 9, 110, 0.95, true, "promotions"],
  ["DesignBoard", "team@designboard.example", 7, 120, 0.94, true, "social"],
  ["CodeHost", "notifications@codehost.example", 38, 12, 0.3, false, "updates"],
  ["Northwind Bank", "alerts@northwindbank.example", 16, 25, 0.2, false, "updates"],
  ["CloudDeploy", "noreply@clouddeploy.example", 12, 18, 0.5, false, "updates"],
  ["Priya Sharma", "priya@studio.example", 14, 320, 0.05, false, "primary"],
  ["Rahul Verma", "rahul@client.example", 10, 450, 0.1, false, "primary"],
  ["Finance Team", "accounts@company.example", 8, 600, 0.1, false, "primary"],
  ["ChatSpace", "feedback@chatspace.example", 9, 30, 0.75, false, "social"],
  ["NoteNest", "updates@notenest.example", 5, 60, 0.85, true, "updates"],
  ["RailBook", "tickets@railbook.example", 2, 200, 0.1, false, "purchases"],
  ["Fitness Club", "news@fitclub.example", 11, 75, 0.93, true, "promotions"],
  ["GreenGrocer", "basket@greengrocer.example", 15, 50, 0.9, true, "purchases"],
];

// Bump to reseed demo databases created by an older version.
const DEMO_VERSION = "2";

const ACCOUNTS = [
  { provider: "gmail", email: "you@example.com", share: 0.65 },
  { provider: "yahoo", email: "you@example.org", share: 0.35 },
];

// Deterministic pseudo-random numbers so the demo looks the same every time.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Replaces all data with the sample mailboxes. */
export function seedDemo() {
  const d = db();
  d.exec("DELETE FROM accounts; DELETE FROM messages; DELETE FROM unsubscribed;");
  const rand = rng(42);
  const now = Date.now();
  const months = 30; // spread over ~2.5 years so the year filter is useful

  for (const acc of ACCOUNTS) {
    const id = crypto.randomUUID();
    d.prepare(`INSERT INTO accounts (id, provider, email, sync_status, synced, total, last_sync_at, created_at)
      VALUES (?, ?, ?, 'done', 0, 0, ?, ?)`).run(id, acc.provider, acc.email, now, now);

    const rows: MessageMeta[] = [];
    let n = 0;
    for (const [name, email, perMonth, kb, unreadRate, newsletter, category] of SENDERS) {
      const personal = category === "primary";
      const count = Math.round(perMonth * months * acc.share * (0.5 + rand() * 0.9));
      for (let i = 0; i < count; i++) {
        rows.push({
          msg_id: `demo-${acc.provider}-${n++}`,
          from_email: email,
          from_name: name,
          date: now - Math.floor(rand() ** 0.8 * months * 30.4 * 86_400_000),
          size: Math.round(kb * 1024 * (0.5 + rand())),
          unread: rand() < unreadRate,
          in_inbox: rand() < 0.85,
          unsub_http: newsletter ? `https://${email.split("@")[1]}/unsubscribe` : null,
          unsub_mailto: null,
          one_click: newsletter,
          // Only Gmail has tabs; a few emails land in another tab, as in real life.
          category: acc.provider === "gmail" ? (rand() < 0.92 ? category : personal ? "updates" : "primary") : null,
          starred: personal && rand() < 0.25,
          important: acc.provider === "gmail" && (personal || email.includes("bank")) && rand() < 0.7,
        });
      }
    }
    insertMessages(id, rows);
    d.prepare("UPDATE accounts SET synced = ?, total = ? WHERE id = ?").run(rows.length, rows.length, id);
  }
  d.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('demo_seeded_at', ?)").run(`${DEMO_VERSION}:${now}`);
}

/** In demo mode, seed the sample data once per server instance. The data itself is never modified. */
export function ensureDemo() {
  if (!isDemo()) return;
  const row = db().prepare("SELECT v FROM kv WHERE k = 'demo_seeded_at'").get() as { v: string } | undefined;
  if (!row?.v.startsWith(`${DEMO_VERSION}:`)) seedDemo();
}

// Each visitor's demo changes live in their own cookie, not in the shared sample data: serverless
// functions don't share storage, and visitors shouldn't see each other's clean-ups.
export const DEMO_COOKIE = "mailclean_demo";

export interface DemoState {
  /** Senders this visitor moved to Trash. */
  trashed: string[];
  /** Senders this visitor unsubscribed from. */
  unsubscribed: string[];
}

export function readDemoState(raw: string | undefined): DemoState {
  try {
    const v = JSON.parse(Buffer.from(raw ?? "", "base64url").toString("utf8"));
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 200) : []);
    return { trashed: list(v.trashed), unsubscribed: list(v.unsubscribed) };
  } catch {
    return { trashed: [], unsubscribed: [] };
  }
}

export function demoCookie(state: DemoState) {
  return {
    name: DEMO_COOKIE,
    value: Buffer.from(JSON.stringify(state)).toString("base64url"),
    options: { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 },
  };
}
