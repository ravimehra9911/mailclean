# MailClean

Connect Gmail and Yahoo accounts, see which senders fill every inbox, unsubscribe from newsletters and
trash or archive thousands of emails per sender in one click.

**Privacy:** only metadata is stored (sender, date, size, read/inbox status, unsubscribe link).
Subjects and bodies are never fetched. OAuth tokens are encrypted (AES-256-GCM) in a local SQLite database.

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local   # then fill in the keys below
npm run dev                  # http://localhost:3000
```

## Desktop app (macOS and Windows)

MailClean also ships as an Electron app that bundles its own server (port **47321**, this computer only)
and keeps its data in the app's folder: `~/Library/Application Support/MailClean` on macOS,
`%APPDATA%\MailClean` on Windows.

```bash
npm run desktop:mac     # dist-desktop/MailClean-<version>-arm64.dmg (Apple Silicon) and MailClean-<version>.dmg (Intel)
npm run desktop:win     # dist-desktop/MailClean Setup <version>.exe
npm run desktop:dev     # Electron window around `npm run dev` (start that first)
```

- The Google keys from `.env.local` are written to `build/config.json` (gitignored) and bundled in the app.
  A user can override them in `<app data folder>/config.json`.
- Add this **Authorized redirect URI** to the Google OAuth client:
  `http://localhost:47321/api/connect/google/callback`
- Google blocks sign-in inside app windows, so "Connect Gmail" opens the system browser. After signing in,
  return to the app; it refreshes on focus.
- The builds are **not code-signed**. macOS: right-click the app → **Open** the first time.
  Windows: SmartScreen → **More info → Run anyway**. Sign them before giving the app to other people.
- Server logs: `<app data folder>/logs/server.log`.

## Connect Gmail (Google Cloud)

1. Go to <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen** → User type *External* → fill app name and your email.
   - Scopes: add `.../auth/gmail.modify`.
   - **Test users:** add every Gmail address you want to connect (up to 100).
4. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorized redirect URI: `http://localhost:3000/api/connect/google/callback`
5. Put the client ID and secret into `.env.local` and restart `npm run dev`.

While the app is in **Testing** mode Google shows an "unverified app" warning (click *Continue*) and
refresh tokens expire after **7 days**, so you will need to reconnect weekly. Publishing for the public
requires Google verification plus a CASA security assessment because `gmail.modify` is a restricted scope.

## Connect Yahoo Mail (IMAP + app password)

Yahoo has no public mail API for this, so MailClean connects over IMAP (`imap.mail.yahoo.com:993`).
No developer keys are needed.

1. Go to <https://login.yahoo.com/account/security>.
2. Click **Generate app password** (or **Manage app passwords**), name it "MailClean", copy the 16-letter password.
3. In MailClean: **Accounts → Connect Yahoo Mail**, enter your Yahoo address and the app password.

The app password is stored encrypted like the OAuth tokens. All folders except Trash, Spam, Sent and Drafts are scanned;
**Trash** moves mail to Yahoo's Trash folder and **Archive** moves Inbox mail to Archive. To revoke access,
delete the app password on the same Yahoo page.

## Connect Outlook / Hotmail / Microsoft 365 (Azure)

> Hidden in the UI for now. Set `SHOW_OUTLOOK = true` in `src/components/Dashboard.tsx` to enable it.

1. Go to <https://portal.azure.com> → **App registrations → New registration**.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
   - Redirect URI: platform *Web*, `http://localhost:3000/api/connect/microsoft/callback`
2. **Certificates & secrets → New client secret** → copy the *Value*.
3. **API permissions → Add → Microsoft Graph → Delegated**: `Mail.ReadWrite`, `User.Read`, `offline_access`, `openid`, `email`.
4. Put the Application (client) ID and secret into `.env.local` and restart.

## How it works

| Piece | File |
|---|---|
| SQLite schema and helpers | `src/lib/db.ts` |
| Token encryption | `src/lib/crypto.ts` |
| Gmail API (metadata sync, batch trash/archive) | `src/lib/providers/google.ts` |
| Microsoft Graph (sync, `$batch` move to Deleted Items/Archive) | `src/lib/providers/microsoft.ts` |
| IMAP (Yahoo): one FETCH per folder, move to Trash/Archive | `src/lib/providers/imap.ts` |
| Background sync and token refresh | `src/lib/accounts.ts` |
| Clean-up and unsubscribe (RFC 8058 one-click, SSRF-guarded) | `src/lib/actions.ts` |
| Sender and overview queries | `src/lib/stats.ts` |
| Dashboard UI | `src/components/` |

- **Trash** moves mail to the provider's Trash / Deleted Items (recoverable for ~30 days). Nothing is permanently deleted.
- **Unsubscribe** does a one-click POST when the sender supports RFC 8058; otherwise it opens the sender's unsubscribe page.
- **Rescan** is incremental: only new messages are fetched; mail deleted elsewhere is removed from the stats.

## Before making this public

This MVP is **single-user** (no login): anyone who can reach the server sees all connected accounts.
Keep it on localhost. To turn it into a SaaS you need:

- user accounts and per-user data isolation
- Postgres instead of SQLite, and a job queue (e.g. BullMQ) instead of in-process sync
- Google OAuth verification and a CASA assessment; Microsoft publisher verification
- privacy policy, terms and data-deletion flow
