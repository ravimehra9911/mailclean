import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { ImapProviderId } from "./catalog";

// Loaded via getBuiltinModule so the bundler leaves Node's built-in SQLite alone.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

// On Vercel only /tmp is writable (used by the web demo).
export const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? "/tmp/mailclean" : path.join(process.cwd(), ".data"));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,            -- OAuth: 'google'; IMAP: see src/lib/catalog.ts
  email         TEXT NOT NULL,
  access_token  TEXT,                     -- encrypted
  refresh_token TEXT,                     -- encrypted (IMAP accounts: the app password)
  expires_at    INTEGER,
  sync_status   TEXT NOT NULL DEFAULT 'idle',  -- idle | syncing | done | error
  sync_error    TEXT,
  synced        INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  last_sync_at  INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE(provider, email)
);

-- Metadata only: subjects and bodies are never stored (and never requested, except inside Yahoo/AOL header blocks).
CREATE TABLE IF NOT EXISTS messages (
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  msg_id       TEXT NOT NULL,
  from_email   TEXT NOT NULL,
  from_name    TEXT,
  date         INTEGER NOT NULL,         -- epoch ms
  size         INTEGER NOT NULL DEFAULT 0,
  unread       INTEGER NOT NULL DEFAULT 0,
  in_inbox     INTEGER NOT NULL DEFAULT 1,
  unsub_http   TEXT,
  unsub_mailto TEXT,
  one_click    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, msg_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT
);

-- Clean-up rules applied after every sync (v1.5). A rule matches a sender or a Gmail tab.
CREATE TABLE IF NOT EXISTS rules (
  id              TEXT PRIMARY KEY,
  sender          TEXT,                  -- match emails from this address, or NULL
  category        TEXT,                  -- match emails in this Gmail tab, or NULL
  older_than_days INTEGER NOT NULL DEFAULT 0,
  action          TEXT NOT NULL,         -- 'trash' | 'archive'
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  last_run_at     INTEGER,
  cleaned         INTEGER NOT NULL DEFAULT 0  -- emails this rule has moved so far
);

-- Attachment downloads (v1.8.1): one row per download, shown on the Downloads page. Files themselves are not stored.
CREATE TABLE IF NOT EXISTS downloads (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,             -- sender name, or "N senders"
  formats     TEXT NOT NULL,             -- e.g. "pdf,png"
  folder      TEXT NOT NULL,
  total       INTEGER NOT NULL,
  saved       INTEGER NOT NULL DEFAULT 0,
  existing    INTEGER NOT NULL DEFAULT 0, -- already in the folder from an earlier download, skipped
  failed      INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0, -- bytes written
  status      TEXT NOT NULL,             -- 'running' | 'done' | 'cancelled' | 'interrupted'
  errors      TEXT,                      -- JSON array, first few only
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);

-- Which attachment was saved to which file (v1.8.1), so a later download skips exactly what is already saved.
CREATE TABLE IF NOT EXISTS downloaded_parts (
  account_id TEXT NOT NULL,
  msg_id     TEXT NOT NULL,
  part       TEXT NOT NULL,              -- MIME part number
  file       TEXT NOT NULL,
  size       INTEGER NOT NULL,           -- bytes on disk when saved; a different size means re-download
  at         INTEGER NOT NULL,
  PRIMARY KEY (account_id, msg_id, part)
);
CREATE INDEX IF NOT EXISTS idx_downloaded_parts_file ON downloaded_parts(file);

CREATE TABLE IF NOT EXISTS unsubscribed (
  from_email TEXT PRIMARY KEY,
  method     TEXT NOT NULL,              -- 'one-click' | 'link' | 'mailto'
  at         INTEGER NOT NULL
);
`;

const g = globalThis as unknown as { __mailcleanDb?: DatabaseSyncType };

export function db(): DatabaseSyncType {
  if (!g.__mailcleanDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // The web demo (MAILCLEAN_DEMO / Vercel) wipes and reseeds its data, so it gets its own file and can
    // never touch a real mailclean.db even if pointed at the same folder.
    const demo = process.env.MAILCLEAN_DEMO === "1" || process.env.VERCEL === "1";
    const d = new DatabaseSync(path.join(DATA_DIR, demo ? "demo.db" : "mailclean.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    d.exec(SCHEMA);
    // Migrations for databases created by earlier versions.
    const cols = (d.prepare("PRAGMA table_info(accounts)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("notice")) d.exec("ALTER TABLE accounts ADD COLUMN notice TEXT");
    // IMAP connection details (NULL for OAuth accounts and for older rows, which use the provider default).
    if (!cols.includes("imap_host")) d.exec("ALTER TABLE accounts ADD COLUMN imap_host TEXT");
    if (!cols.includes("imap_port")) d.exec("ALTER TABLE accounts ADD COLUMN imap_port INTEGER");
    if (!cols.includes("imap_user")) d.exec("ALTER TABLE accounts ADD COLUMN imap_user TEXT");
    // Gmail categories and flags (v1.4). NULL category = not Gmail, or scanned before v1.4.
    const mcols = (d.prepare("PRAGMA table_info(messages)").all() as { name: string }[]).map((c) => c.name);
    if (!mcols.includes("category")) d.exec("ALTER TABLE messages ADD COLUMN category TEXT");
    if (!mcols.includes("starred")) d.exec("ALTER TABLE messages ADD COLUMN starred INTEGER NOT NULL DEFAULT 0");
    if (!mcols.includes("important")) d.exec("ALTER TABLE messages ADD COLUMN important INTEGER NOT NULL DEFAULT 0");
    d.exec("CREATE INDEX IF NOT EXISTS idx_messages_category ON messages(category)");
    // A scan can't survive a server restart; let the user resume it (stored emails are skipped).
    d.prepare("UPDATE accounts SET sync_status = 'error', sync_error = 'Scan was interrupted — click Rescan to continue' WHERE sync_status = 'syncing'").run();
    // Downloads can't survive a restart either.
    d.prepare("UPDATE downloads SET status = 'interrupted', finished_at = ? WHERE status = 'running'").run(Date.now());
    g.__mailcleanDb = d;
  }
  return g.__mailcleanDb;
}

export type OAuthProvider = "google";
export type Provider = OAuthProvider | ImapProviderId;

export interface AccountRow {
  id: string;
  provider: Provider;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  sync_status: "idle" | "syncing" | "done" | "error";
  sync_error: string | null;
  synced: number;
  total: number;
  last_sync_at: number | null;
  created_at: number;
  notice: string | null; // informational message shown on the account, e.g. provider limits
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
}

export interface MessageMeta {
  msg_id: string;
  from_email: string;
  from_name: string | null;
  date: number;
  size: number;
  unread: boolean;
  in_inbox: boolean;
  unsub_http: string | null;
  unsub_mailto: string | null;
  one_click: boolean;
  /** Gmail tab (see GMAIL_CATEGORIES); null for other providers. */
  category?: GmailCategory | null;
  starred?: boolean;
  important?: boolean;
}

/** Gmail's inbox tabs, in the order Gmail shows them. */
export const GMAIL_CATEGORIES = ["primary", "promotions", "social", "updates", "forums", "purchases"] as const;
export type GmailCategory = (typeof GMAIL_CATEGORIES)[number];
/**
 * Gmail can put one email in several tabs (e.g. a receipt is in both Purchases and Updates). We keep one,
 * checking the most specific first.
 */
export const CATEGORY_PRIORITY: readonly Exclude<GmailCategory, "primary">[] = ["purchases", "social", "forums", "promotions", "updates"];
export const isGmailCategory = (c: unknown): c is GmailCategory => GMAIL_CATEGORIES.includes(c as GmailCategory);

export function getAccount(id: string): AccountRow | undefined {
  return db().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
}

export function listAccounts(): AccountRow[] {
  return db().prepare("SELECT * FROM accounts ORDER BY created_at").all() as unknown as AccountRow[];
}

export function updateAccount(id: string, fields: Partial<AccountRow>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE accounts SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  db().prepare(sql).run(...(keys.map((k) => (fields as Record<string, never>)[k]) as never[]), id);
}

export function insertMessages(accountId: string, rows: MessageMeta[]) {
  const d = db();
  const stmt = d.prepare(`INSERT OR REPLACE INTO messages
    (account_id, msg_id, from_email, from_name, date, size, unread, in_inbox, unsub_http, unsub_mailto, one_click, category, starred, important)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  d.exec("BEGIN");
  try {
    for (const r of rows) {
      stmt.run(accountId, r.msg_id, r.from_email, r.from_name, r.date, r.size,
        r.unread ? 1 : 0, r.in_inbox ? 1 : 0, r.unsub_http, r.unsub_mailto, r.one_click ? 1 : 0,
        r.category ?? null, r.starred ? 1 : 0, r.important ? 1 : 0);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
