import crypto from "node:crypto";
import { db, getAccount, insertMessages, updateAccount, type AccountRow, type OAuthProvider } from "./db";
import { decrypt, encrypt } from "./crypto";
import { google } from "./providers/google";
import { microsoft } from "./providers/microsoft";
import { IMAP_PROVIDERS, isImapProvider, type ImapProviderId } from "./catalog";
import { imapArchive, imapSync, imapTrash, type ImapConfig } from "./providers/imap";
import type { MailProvider } from "./providers/types";

export const providers: Record<OAuthProvider, MailProvider> = { google, microsoft };

const isImap = isImapProvider;

/** IMAP settings for an account: stored values, falling back to the provider's defaults. */
export function imapConfig(a: AccountRow): ImapConfig {
  if (!isImap(a.provider) || !a.refresh_token) throw new Error("Not an IMAP account");
  const info = IMAP_PROVIDERS[a.provider];
  const host = a.imap_host || info.host;
  if (!host) throw new Error("No IMAP server set for this account — remove it and add it again");
  return {
    host,
    port: a.imap_port || info.port,
    user: a.imap_user || a.email,
    pass: decrypt(a.refresh_token),
    label: info.label,
    folderCap: "folderCap" in info ? info.folderCap : undefined,
  };
}

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

/** Saves an IMAP account; the app password is stored encrypted. */
export function saveImapAccount(
  provider: ImapProviderId,
  email: string,
  password: string,
  conn: { host: string; port: number; user: string },
): string {
  const fields = { refresh_token: encrypt(password), imap_host: conn.host, imap_port: conn.port, imap_user: conn.user, sync_error: null };
  const existing = db().prepare("SELECT id FROM accounts WHERE provider = ? AND email = ?").get(provider, email) as { id: string } | undefined;
  if (existing) {
    updateAccount(existing.id, fields);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db().prepare(`INSERT INTO accounts (id, provider, email, refresh_token, imap_host, imap_port, imap_user, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, provider, email, fields.refresh_token, conn.host, conn.port, conn.user, Date.now());
  return id;
}

/** Valid access token for an account, refreshing it if it expires within a minute. */
export async function accessToken(id: string): Promise<string> {
  const a = getAccount(id);
  if (!a || isImap(a.provider)) throw new Error("Unknown OAuth account");
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
    const hooks = {
      onTotal: (total: number) => updateAccount(a.id, { total }),
      onSeen: (msgId: string) => seen.add(msgId),
      onBatch: (rows: Parameters<typeof insertMessages>[1]) => {
        if (rows.length) insertMessages(a.id, rows);
        if (Date.now() - lastWrite > 500) {
          updateAccount(a.id, { synced: seen.size });
          lastWrite = Date.now();
        }
      },
      limit,
    };
    const complete = isImap(a.provider)
      ? await (async () => {
          const cfg = imapConfig(a);
          return imapSync(cfg, {
            ...hooks,
            onCapped: (folders) => updateAccount(a.id, {
              notice: folders.length
                ? `${cfg.label} only lets apps see the newest ${cfg.folderCap!.toLocaleString("en-IN")} emails in ${folders.join(", ")}. `
                  + "Older emails appear automatically as you clean up — MailClean rescans after each clean-up."
                : null,
            }),
          });
        })()
      : await providers[a.provider].sync({ ...hooks, getToken: () => accessToken(a.id), isKnown: (msgId) => known.has(msgId) });
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

/** Trash or archive messages at the provider. */
export async function moveMessages(a: AccountRow, ids: string[], action: "trash" | "archive") {
  if (isImap(a.provider)) {
    const fn = action === "trash" ? imapTrash : imapArchive;
    await fn(imapConfig(a), ids);
    // Capped folders (Yahoo, AOL): rescanning after a clean-up brings older mail into view.
    if (a.notice) startSync(a.id);
    return;
  }
  return providers[a.provider][action](await accessToken(a.id), ids);
}

export function removeAccount(id: string) {
  // Messages cascade. Tokens are deleted with the row.
  db().prepare("DELETE FROM accounts WHERE id = ?").run(id);
}
