// Mail providers that connect with an app password over IMAP. Shared by the server and the UI,
// so it must not import Node modules.

export interface ImapProviderInfo {
  id: ImapProviderId;
  label: string;
  icon: string;
  color: string;
  /** Default IMAP server; `null` means the user enters it (custom IMAP). */
  host: string | null;
  port: number;
  placeholder: string;
  /** Where the user creates an app password. */
  appPasswordUrl?: string;
  steps: readonly string[];
  /** Shown under the steps, e.g. prerequisites. */
  note?: string;
  /** Server only shows the newest N messages per folder (Yahoo, AOL). */
  folderCap?: number;
}

export const IMAP_PROVIDERS = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    icon: "G",
    color: "#ea4335",
    host: "imap.gmail.com",
    port: 993,
    placeholder: "you@gmail.com",
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    steps: [
      "Turn on 2-Step Verification for your Google account (required for app passwords).",
      "Open Google App passwords, type the name “MailClean” and click Create.",
      "Copy the 16-letter password and paste it below.",
    ],
    note: "Works for @gmail.com and Google Workspace accounts. If “App passwords” is missing, your admin or Advanced Protection has turned it off.",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo Mail",
    icon: "Y!",
    color: "#7e1fff",
    host: "imap.mail.yahoo.com",
    port: 993,
    placeholder: "you@yahoo.com",
    appPasswordUrl: "https://login.yahoo.com/account/security",
    steps: [
      "Open Yahoo Account Security.",
      "Click Generate app password (or Manage app passwords) and name it “MailClean”.",
      "Copy the 16-letter password and paste it below.",
    ],
    folderCap: 10_000,
  },
  icloud: {
    id: "icloud",
    label: "iCloud Mail",
    icon: "iC",
    color: "#3b82f6",
    host: "imap.mail.me.com",
    port: 993,
    placeholder: "you@icloud.com",
    appPasswordUrl: "https://account.apple.com/account/manage",
    steps: [
      "Sign in to your Apple Account and open Sign-In and Security → App-Specific Passwords.",
      "Click +, name it “MailClean” and copy the password.",
      "Enter your @icloud.com / @me.com address and paste the password below.",
    ],
    note: "Two-factor authentication must be on for your Apple Account.",
  },
  aol: {
    id: "aol",
    label: "AOL Mail",
    icon: "Aol",
    color: "#2f6fe4",
    host: "imap.aol.com",
    port: 993,
    placeholder: "you@aol.com",
    appPasswordUrl: "https://login.aol.com/account/security",
    steps: [
      "Open AOL Account Security.",
      "Click Generate app password, name it “MailClean” and copy it.",
      "Paste the password below.",
    ],
    folderCap: 10_000,
  },
  zoho: {
    id: "zoho",
    label: "Zoho Mail",
    icon: "Z",
    color: "#e42527",
    host: "imap.zoho.com",
    port: 993,
    placeholder: "you@zohomail.com",
    appPasswordUrl: "https://accounts.zoho.com/home#security/app_password",
    steps: [
      "In Zoho Mail settings, make sure IMAP access is enabled.",
      "Open Zoho Accounts → Security → App Passwords and generate one named “MailClean”.",
      "Paste it below. India accounts use imap.zoho.in and EU accounts imap.zoho.eu (Advanced).",
    ],
  },
  imap: {
    id: "imap",
    label: "Other (IMAP)",
    icon: "@",
    color: "#6b7280",
    host: null,
    port: 993,
    placeholder: "you@yourdomain.com",
    steps: [
      "Find your provider's IMAP server name (for example imap.yourdomain.com) in its help pages.",
      "Use an app password if your provider offers one, otherwise your mail password.",
      "Only secure connections (SSL/TLS, usually port 993) are supported.",
    ],
  },
} as const satisfies Record<string, Omit<ImapProviderInfo, "id"> & { id: string }>;

export type ImapProviderId = keyof typeof IMAP_PROVIDERS;

export const isImapProvider = (p: string): p is ImapProviderId => Object.hasOwn(IMAP_PROVIDERS, p);

/** Display info for any provider id stored in the database, including OAuth ones. */
export function providerInfo(id: string): { label: string; icon: string; color: string } {
  if (isImapProvider(id)) return IMAP_PROVIDERS[id];
  if (id === "google") return { label: "Gmail", icon: "G", color: "#ea4335" };
  return { label: id, icon: "@", color: "#6b7280" };
}

/**
 * Web-mail link for a sender's emails in one of the user's accounts. `search` is false when the provider has
 * no search link (the UI then copies the address so the user can paste it into the provider's search).
 */
export function mailboxLink(provider: string, account: string, sender: string): { url: string; search: boolean } | null {
  const q = encodeURIComponent;
  switch (provider) {
    case "gmail":
    case "google":
      // authuser picks the right Google account when several are signed in.
      return { url: `https://mail.google.com/mail/?authuser=${q(account)}#search/${q(`from:${sender}`)}`, search: true };
    // Yahoo and AOL have no documented search link, so open the mailbox; the UI copies the address.
    case "yahoo":
      return { url: "https://mail.yahoo.com/", search: false };
    case "aol":
      return { url: "https://mail.aol.com/", search: false };
    case "icloud":
      return { url: "https://www.icloud.com/mail/", search: false };
    case "zoho":
      return { url: "https://mail.zoho.com/zm/", search: false };
    default:
      return null;
  }
}

/**
 * The provider's own page listing apps and services with access to the account (and app passwords), where the
 * user can review and remove them. MailClean can't read these lists itself; it links to them.
 */
export function accessSettings(provider: string, account: string): { url: string; label: string; text: string } | null {
  const q = encodeURIComponent;
  switch (provider) {
    case "gmail":
    case "google":
      return { url: `https://myaccount.google.com/connections?authuser=${q(account)}`, label: "Open Google settings",
        text: "Apps using “Sign in with Google” or with access to your Google account" };
    case "yahoo":
      return { url: "https://login.yahoo.com/account/security", label: "Open Yahoo settings",
        text: "App passwords and recent account activity for your Yahoo account" };
    case "aol":
      return { url: "https://login.aol.com/account/security", label: "Open AOL settings",
        text: "App passwords and recent account activity for your AOL account" };
    case "icloud":
      return { url: "https://account.apple.com/account/manage", label: "Open Apple Account",
        text: "Apps using “Sign in with Apple” and your app-specific passwords" };
    case "zoho":
      return { url: "https://accounts.zoho.com/home", label: "Open Zoho Accounts",
        text: "Connected apps, sessions and app passwords for your Zoho account" };
    default:
      return null;
  }
}

/** Other places where apps commonly get access through "Sign in with…". */
export const OTHER_ACCESS_PAGES = [
  { label: "Sign in with Apple", url: "https://account.apple.com/account/manage" },
  { label: "Facebook apps", url: "https://www.facebook.com/settings/?tab=applications" },
  { label: "Microsoft", url: "https://account.live.com/consent/Manage" },
] as const;
