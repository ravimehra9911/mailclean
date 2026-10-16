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
  provider      TEXT NOT NULL,            -- OAuth: 'google' | 'microsoft'; IMAP: see src/lib/catalog.ts
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

-- Metadata only: we never store subjects or bodies.
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
    // A scan can't survive a server restart; let the user resume it (stored emails are skipped).
    d.prepare("UPDATE accounts SET sync_status = 'error', sync_error = 'Scan was interrupted — click Rescan to continue' WHERE sync_status = 'syncing'").run();
    g.__mailcleanDb = d;
  }
  return g.__mailcleanDb;
}

export type OAuthProvider = "google" | "microsoft";
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
}

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
    (account_id, msg_id, from_email, from_name, date, size, unread, in_inbox, unsub_http, unsub_mailto, one_click)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  d.exec("BEGIN");
  try {
    for (const r of rows) {
      stmt.run(accountId, r.msg_id, r.from_email, r.from_name, r.date, r.size,
        r.unread ? 1 : 0, r.in_inbox ? 1 : 0, r.unsub_http, r.unsub_mailto, r.one_click ? 1 : 0);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
