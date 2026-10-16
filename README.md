# MailClean

A desktop app (macOS and Windows) that connects Gmail, Yahoo, iCloud, AOL, Zoho and any IMAP mailbox,
shows which senders fill every inbox, unsubscribes from newsletters and trashes or archives thousands of
emails per sender in one click.

**Privacy:** everything runs and stays on the user's device; there is no MailClean server or account.
Only metadata is stored (sender, date, size, read/inbox status, unsubscribe link); subjects and bodies are
never fetched. Passwords and tokens are encrypted (AES-256-GCM) in a local SQLite database.

## How users connect accounts

Every provider connects with an **app password over IMAP** (TLS only). No developer keys, Google
verification or security audit are needed, and there are no API rate limits.

| Provider | IMAP server | Where to create an app password |
|---|---|---|
| Gmail / Google Workspace | `imap.gmail.com` | <https://myaccount.google.com/apppasswords> (needs 2-Step Verification) |
| Yahoo Mail | `imap.mail.yahoo.com` | <https://login.yahoo.com/account/security> |
| iCloud Mail | `imap.mail.me.com` | <https://account.apple.com> → Sign-In and Security → App-Specific Passwords |
| AOL Mail | `imap.aol.com` | <https://login.aol.com/account/security> |
| Zoho Mail | `imap.zoho.com` (`.in`, `.eu` by region) | Zoho Accounts → Security → App Passwords |
| Anything else | user enters server, port, username | provider's help pages |

The in-app **Add account** screen shows these steps per provider. Provider details live in
`src/lib/catalog.ts`; adding a provider is one entry there.

Provider notes:

- **Gmail**: MailClean scans the single *All Mail* folder and reads Gmail labels, so labelled mail is not
  counted twice. Archive removes the Inbox label; Trash moves to `[Gmail]/Trash`.
- **Yahoo and AOL** only let apps see the newest **10,000 emails per folder**. The app says so and rescans
  after every clean-up, which brings older mail into view.
- **Outlook / Hotmail** no longer allows app passwords for IMAP. Support via Microsoft Graph is built
  (`src/lib/providers/microsoft.ts`) but hidden until a Microsoft app registration is set up
  (`SHOW_OUTLOOK` in `src/components/AddAccount.tsx`).

## Develop

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev            # http://localhost:3000 — data in ./.data
npm run desktop:dev    # Electron window around the dev server (start `npm run dev` first)
```

## Build the desktop app

```bash
npm run desktop:mac    # dist-desktop/MailClean-<version>-arm64.dmg (Apple Silicon) and MailClean-<version>.dmg (Intel)
npm run desktop:win    # dist-desktop/MailClean Setup <version>.exe (x64)
```

The version comes from `electron/package.json`. App data lives in `~/Library/Application Support/MailClean`
(macOS) or `%APPDATA%\MailClean` (Windows); server logs are in its `logs/` folder.

### Before publishing

- **Code signing.** The builds are unsigned, so macOS Gatekeeper and Windows SmartScreen warn users.
  - macOS: an Apple Developer ID certificate plus notarization. Set `CSC_LINK`/`CSC_KEY_PASSWORD` and
    `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, then build; electron-builder signs and notarizes.
  - Windows: an OV/EV code-signing certificate (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) or Azure Trusted Signing.
- **App ID and name** are in the `build` section of `package.json` (`appId: app.mailclean.desktop`).
- Bump `version` in `electron/package.json` for each release.

## Security model

- The bundled server listens on **127.0.0.1:47321** only and is never reachable from the network.
- Each launch generates a random token; the app window adds it to every request and the server
  (`src/middleware.ts`) refuses API calls without it. This stops websites in the user's browser from
  calling the local server (CSRF) and blocks DNS rebinding via a Host check.
- External links (unsubscribe pages, provider help) open in the system browser; the app window only
  shows MailClean.
- Unsubscribe one-click POSTs only go to public HTTPS hosts (SSRF guard in `src/lib/actions.ts`).
- Nothing is permanently deleted: Trash moves mail to the provider's Trash.

## Optional: Gmail via Google sign-in (OAuth)

App passwords are the default. Google sign-in is still supported for personal/internal builds; it requires a
Google Cloud project with the Gmail API, `gmail.modify` scope, test users, and these redirect URIs:
`http://localhost:3000/api/connect/google/callback` (dev) and `http://localhost:47321/api/connect/google/callback`
(desktop). Put the keys in `.env.local` (see `.env.example`). Public desktop builds **do not** include the keys;
build with `MAILCLEAN_BUNDLE_OAUTH=1 npm run desktop:mac` to bundle them for your own use. Offering Google
sign-in to the public requires Google's OAuth verification and a CASA security assessment.

## Code map

| Piece | File |
|---|---|
| Provider catalog (IMAP servers, app-password steps) | `src/lib/catalog.ts` |
| IMAP sync, trash and archive | `src/lib/providers/imap.ts` |
| Gmail API / Microsoft Graph (optional OAuth) | `src/lib/providers/google.ts`, `microsoft.ts` |
| Accounts, background sync, token refresh | `src/lib/accounts.ts` |
| Clean-up and unsubscribe (RFC 8058 one-click) | `src/lib/actions.ts` |
| Sender and overview queries | `src/lib/stats.ts` |
| SQLite schema and migrations | `src/lib/db.ts` |
| Request lock for the desktop app | `src/middleware.ts` |
| Dashboard UI | `src/components/` |
| Electron main process | `electron/main.cjs` |
| Packaging scripts | `scripts/` |
