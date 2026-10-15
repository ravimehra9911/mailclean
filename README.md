# MailClean

Connect Gmail and Outlook accounts, see which senders fill every inbox, unsubscribe from newsletters and
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
