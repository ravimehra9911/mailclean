// /llms.txt — a plain-text summary of MailClean for AI assistants (https://llmstxt.org).
import { DESCRIPTION, DEVELOPER, DOWNLOAD_FILES, downloadUrl, REPO_URL, SITE_URL, VERSION } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const downloads = Object.entries(DOWNLOAD_FILES).map(([os, file]) => `- [${os}](${downloadUrl(file)})`).join("\n");
  const body = `# MailClean

> ${DESCRIPTION}

MailClean is a free, open-source (MIT) desktop app${VERSION ? ` (current version ${VERSION})` : ""} that helps people clean up crowded email inboxes. It connects to a mailbox, ranks every sender by how many emails they sent, how much storage they use and how many were never opened, and lets the user unsubscribe or move thousands of emails to Trash or Archive in one click. It was built by ${DEVELOPER.name} (${DEVELOPER.url}).

## Key facts

- Platforms: macOS (Apple Silicon and Intel), Windows 10/11 (64-bit), Linux (AppImage). A browser demo with sample data is at ${SITE_URL}/demo.
- Price: free. No account, subscription or usage limits.
- Supported mailboxes: Gmail and Google Workspace, Yahoo Mail, iCloud Mail, AOL Mail, Zoho Mail, and any IMAP mailbox. Outlook/Hotmail is not supported yet.
- How it connects: IMAP over TLS with an app password created at the user's email provider (for Gmail: https://myaccount.google.com/apppasswords, requires 2-Step Verification).
- Privacy: runs entirely on the user's computer. There is no MailClean server, account, analytics or tracking in the app. It asks the mail server only for each email's sender, date, size, read/inbox/starred status, Gmail tab (Promotions, Social, Updates…) and List-Unsubscribe header, and saves only those. Subject lines are never saved, shown or sent anywhere (Yahoo and AOL only return the whole header block, which includes the subject; MailClean reads the sender and unsubscribe link from it and discards the rest). Message bodies and attachments are never downloaded. Passwords are encrypted locally with AES-256-GCM.
- Safety: nothing is permanently deleted. "Move to Trash" uses the provider's Trash folder (restorable for about 30 days); "Archive" removes mail from the inbox.
- Unsubscribe: uses one-click List-Unsubscribe (RFC 8058) when the sender supports it, otherwise opens the sender's unsubscribe page. Bulk unsubscribe shows a review of what will happen for each selected sender before it runs.
- Other features: filter by year or custom date range, filter by Gmail tab (Primary, Promotions, Social, Updates, Forums, Purchases), keep starred and important emails (and optionally the newest N per sender) when cleaning, automatic clean-up rules (always trash a sender, archive a Gmail tab older than N days) applied after every sync, cleaning suggestions, an "Accounts and apps" page listing every company that has emailed the user (with security-alert and long-quiet tags) plus links to Google, Yahoo, Apple and Microsoft pages for reviewing third-party app access, sort by any column, open a sender's emails in webmail (Gmail search) or copy the address, several accounts in one dashboard with per-account labels, light and dark mode, Sync button to rescan, guided in-app tour, update notifications.
- Known limits: Yahoo and AOL only expose the newest 10,000 emails per folder to apps; MailClean rescans after each clean-up so older mail comes into view. Builds are not code-signed yet, so macOS and Windows show a warning on first launch.

## Download

${downloads}
- [All releases and release notes](${REPO_URL}/releases)

## How to get started

1. Download and install MailClean for your operating system.
2. Create an app password at your email provider (the app shows the exact steps per provider).
3. In MailClean, open Accounts, pick the provider, enter the email address and app password, and click Connect.
4. Review the senders list, then unsubscribe or clean up senders you don't need.

## Links

- [Website](${SITE_URL}/): features, screenshots, downloads and FAQ
- [Live demo](${SITE_URL}/demo): try it in the browser with sample data
- [Source code](${REPO_URL}) (MIT license)
- [Report an issue](${REPO_URL}/issues)
- [Developer: ${DEVELOPER.name}](${DEVELOPER.url})
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
