// Facts about the public website, shared by metadata, structured data, sitemap, robots and llms.txt.

export const SITE_URL = (process.env.MAILCLEAN_SITE_URL || "https://www.mailclean.app").replace(/\/$/, "");
export const SITE_NAME = "MailClean";
export const REPO_URL = "https://github.com/ravimehra9911/mailclean";
export const DEVELOPER = { name: "Ravi Mehra", url: "https://github.com/ravimehra9911", handle: "@ravimehra9911" };
export const VERSION = process.env.MAILCLEAN_VERSION ?? "";

export const TITLE = "MailClean — Free, Private Inbox Cleaner for Gmail, Yahoo & iCloud";
export const DESCRIPTION =
  "Free, open-source email cleaner for macOS, Windows and Linux. See which senders fill your Gmail, Yahoo, iCloud and IMAP inboxes, bulk-delete thousands of emails and unsubscribe in one click. Runs on your computer — your email is never uploaded.";

export const KEYWORDS = [
  "email cleaner", "inbox cleaner", "gmail cleaner", "clean up gmail", "bulk delete emails", "mass unsubscribe",
  "unsubscribe from newsletters", "yahoo mail cleaner", "icloud mail cleaner", "inbox zero", "free email cleanup tool",
  "open source email cleaner", "private email cleaner", "email declutter app", "delete promotional emails",
];

/**
 * Google Search Console HTML-tag verification code (the `content` value of the
 * google-site-verification meta tag). Can also be set with GOOGLE_SITE_VERIFICATION at build time.
 */
export const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || "";

export const DOWNLOAD_FILES = {
  "macOS (Apple Silicon)": "MailClean-mac-arm64.dmg",
  "macOS (Intel)": "MailClean-mac-x64.dmg",
  "Windows 10/11 (64-bit)": "MailClean-windows-x64.exe",
  "Linux (AppImage, x86-64)": "MailClean-linux-x86_64.AppImage",
} as const;

export const downloadUrl = (file: string) => `${REPO_URL}/releases/latest/download/${file}`;
