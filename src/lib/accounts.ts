import crypto from "node:crypto";
import { db, getAccount, insertMessages, updateAccount, type AccountRow, type Provider } from "./db";
import { decrypt, encrypt } from "./crypto";
import { google } from "./providers/google";
import { microsoft } from "./providers/microsoft";
import type { MailProvider } from "./providers/types";

export const providers: Record<Provider, MailProvider> = { google, microsoft };

export function isConfigured(p: "google" | "microsoft") {
  return p === "google"
    ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function saveConnectedAccount(
  provider: "google" | "microsoft",
  t: { email: string; accessToken: string; refreshToken?: string; expiresIn: number },
): string {
  const existing = db().prepare("SELECT id, refresh_token FROM accounts WHERE provider = ? AND email = ?")
    .get(provider, t.email) as { id: string; refresh_token: string | null } | undefined;
  const fields = {
    access_token: encrypt(t.accessToken),
    // Google only returns a refresh token on first consent; keep the old one otherwise.
    refresh_token: t.refreshToken ? encrypt(t.refreshToken) : existing?.refresh_token ?? null,
    expires_at: Date.now() + t.expiresIn * 1000,
  };
  if (existing) {
    updateAccount(existing.id, { ...fields, sync_error: null });
    return existing.id;
  }
  const id = crypto.randomUUID();
  db().prepare(`INSERT INTO accounts (id, provider, email, access_token, refresh_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, provider, t.email, fields.access_token, fields.refresh_token, fields.expires_at, Date.now());
  return id;
}

/** Valid access token for an account, refreshing it if it expires within a minute. */
export async function accessToken(id: string): Promise<string> {
  const a = getAccount(id);
  if (!a) throw new Error("Unknown account");
  if (a.access_token && a.expires_at && a.expires_at > Date.now() + 60_000) return decrypt(a.access_token);
  if (!a.refresh_token) throw new Error("Session expired — reconnect this account");
  const t = await providers[a.provider].refresh(decrypt(a.refresh_token));
  updateAccount(id, {
    access_token: encrypt(t.accessToken),
    expires_at: Date.now() + t.expiresIn * 1000,
    ...(t.refreshToken ? { refresh_token: encrypt(t.refreshToken) } : {}),
  });
  return t.accessToken;
}

const running = ((globalThis as { __mailcleanSyncs?: Set<string> }).__mailcleanSyncs ??= new Set());

/** Starts a background sync. Returns false if one is already running. */
export function startSync(id: string): boolean {
  const a = getAccount(id);
  if (!a || running.has(id)) return false;
  running.add(id);
  updateAccount(id, { sync_status: "syncing", sync_error: null, synced: 0 });
  runSync(a).finally(() => running.delete(id));
  return true;
}

async function runSync(a: AccountRow) {
  const limit = Number(process.env.SYNC_LIMIT) || 50_000;
  const known = new Set(
    (db().prepare("SELECT msg_id FROM messages WHERE account_id = ?").all(a.id) as { msg_id: string }[]).map((r) => r.msg_id),
  );
  const seen = new Set<string>();
  let lastWrite = 0;
  try {
    const complete = await providers[a.provider].sync({
      getToken: () => accessToken(a.id),
      onTotal: (total) => updateAccount(a.id, { total }),
      onSeen: (msgId) => seen.add(msgId),
      isKnown: (msgId) => known.has(msgId),
      onBatch: (rows) => {
        if (rows.length) insertMessages(a.id, rows);
        if (Date.now() - lastWrite > 500) {
          updateAccount(a.id, { synced: seen.size });
          lastWrite = Date.now();
        }
      },
      limit,
    });
    // Drop rows for mail that was deleted elsewhere (only safe after a full walk).
    if (complete) {
      const gone = [...known].filter((msgId) => !seen.has(msgId));
      const del = db().prepare("DELETE FROM messages WHERE account_id = ? AND msg_id = ?");
      for (const msgId of gone) del.run(a.id, msgId);
    }
    updateAccount(a.id, { sync_status: "done", synced: seen.size, total: Math.max(seen.size, 0), last_sync_at: Date.now() });
  } catch (e) {
    console.error(`[sync ${a.email}]`, e);
    updateAccount(a.id, { sync_status: "error", sync_error: e instanceof Error ? e.message : String(e), synced: seen.size });
  }
}

export function removeAccount(id: string) {
  // Messages cascade. Tokens are deleted with the row.
  db().prepare("DELETE FROM accounts WHERE id = ?").run(id);
}
