import crypto from "node:crypto";
import { db, insertMessages, type MessageMeta } from "./db";

// Sample senders: [name, email, emails/month, avg KB, unread rate, newsletter?]
const SENDERS: [string, string, number, number, number, boolean][] = [
  ["Amazon", "store-news@amazon.example", 30, 60, 0.85, true],
  ["Swiggy", "promotions@swiggy.example", 28, 45, 0.97, true],
  ["Zomato", "noreply@zomato.example", 25, 40, 0.95, true],
  ["LinkedIn", "messages-noreply@linkedin.example", 22, 55, 0.7, true],
  ["Myntra", "offers@myntra.example", 20, 80, 0.98, true],
  ["Flipkart", "no-reply@flipkart.example", 18, 70, 0.92, true],
  ["Medium Daily Digest", "noreply@medium.example", 30, 35, 0.9, true],
  ["Product Hunt", "hello@producthunt.example", 8, 50, 0.6, true],
  ["Morning Brew", "crew@morningbrew.example", 22, 90, 0.5, true],
  ["Hacker News Digest", "digest@hn.example", 10, 30, 0.4, true],
  ["Spotify", "no-reply@spotify.example", 6, 120, 0.8, true],
  ["Uber", "uber@uber.example", 9, 65, 0.6, true],
  ["Netflix", "info@netflix.example", 5, 150, 0.7, true],
  ["Canva", "marketing@canva.example", 7, 110, 0.96, true],
  ["Quora Digest", "digest@quora.example", 25, 40, 0.99, true],
  ["GitHub", "notifications@github.example", 35, 12, 0.3, false],
  ["HDFC Bank", "alerts@hdfcbank.example", 15, 25, 0.2, false],
  ["Google", "no-reply@accounts.google.example", 4, 20, 0.1, false],
  ["Vercel", "notifications@vercel.example", 12, 18, 0.5, false],
  ["Priya Sharma", "priya@agency.example", 14, 300, 0.05, false],
  ["Rahul Verma", "rahul@client.example", 10, 450, 0.1, false],
  ["Accounts Team", "accounts@mediadaddy.example", 8, 600, 0.1, false],
  ["Figma", "no-reply@figma.example", 6, 40, 0.6, false],
  ["Slack", "feedback@slack.example", 9, 30, 0.75, false],
  ["Notion", "team@notion.example", 4, 60, 0.85, true],
  ["Coursera", "no-reply@coursera.example", 8, 100, 0.95, true],
  ["Paytm", "no-reply@paytm.example", 12, 35, 0.9, true],
  ["IRCTC", "ticketadmin@irctc.example", 2, 200, 0.1, false],
];

const ACCOUNTS = [
  { email: "you@gmail.demo", share: 0.65 },
  { email: "you@outlook.demo", share: 0.35 },
];

// Deterministic pseudo-random so the demo looks the same each time.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function loadDemo() {
  clearDemo();
  const rand = rng(42);
  const now = Date.now();
  const months = 14;

  for (const acc of ACCOUNTS) {
    const id = crypto.randomUUID();
    db().prepare(`INSERT INTO accounts (id, provider, email, sync_status, synced, total, last_sync_at, created_at)
      VALUES (?, 'demo', ?, 'done', 0, 0, ?, ?)`).run(id, acc.email, now, now);

    const rows: MessageMeta[] = [];
    for (const [name, email, perMonth, kb, unreadRate, newsletter] of SENDERS) {
      const n = Math.round(perMonth * months * acc.share * (0.6 + rand() * 0.8));
      for (let i = 0; i < n; i++) {
        const date = now - Math.floor(rand() * months * 30 * 86_400_000);
        rows.push({
          msg_id: crypto.randomUUID(),
          from_email: email,
          from_name: name,
          date,
          size: Math.round(kb * 1024 * (0.5 + rand())),
          unread: rand() < unreadRate,
          in_inbox: rand() < 0.85,
          unsub_http: newsletter ? `https://${email.split("@")[1]}/unsubscribe` : null,
          unsub_mailto: null,
          one_click: newsletter && rand() < 0.8,
        });
      }
    }
    insertMessages(id, rows);
    db().prepare("UPDATE accounts SET synced = ?, total = ? WHERE id = ?").run(rows.length, rows.length, id);
  }
}

export function clearDemo() {
  db().prepare("DELETE FROM accounts WHERE provider = 'demo'").run();
  db().prepare("DELETE FROM unsubscribed WHERE method = 'demo'").run();
}
