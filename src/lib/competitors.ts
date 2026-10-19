// Facts for the website's comparison chart (/compare and the landing page). Each competitor fact comes from
// that company's own website, checked in October 2026 — re-check before changing.
// true = yes, false = no, string = shown as written (partial or detail).

export type Fact = boolean | string;

export interface Tool {
  id: string;
  name: string;
  /** Official page the facts were taken from. */
  source: string;
  facts: Record<RowId, Fact>;
}

export type RowId =
  | "price" | "free" | "onDevice" | "noDataSale" | "openSource" | "reads"
  | "bulk" | "unsubscribe" | "rules" | "apps" | "outlook";

export const ROWS: { id: RowId; label: string; key?: boolean }[] = [
  { id: "price", label: "Price" },
  { id: "free", label: "Free to use", key: true },
  { id: "onDevice", label: "Email stays on your device", key: true },
  { id: "noDataSale", label: "Doesn't sell or research your email data", key: true },
  { id: "openSource", label: "Open source", key: true },
  { id: "reads", label: "What it reads" },
  { id: "bulk", label: "Bulk delete by sender", key: true },
  { id: "unsubscribe", label: "Unsubscribe", key: true },
  { id: "rules", label: "Automatic rules", key: true },
  { id: "apps", label: "Apps" },
  { id: "outlook", label: "Outlook / Hotmail" },
];

export const MAILCLEAN: Tool = {
  id: "mailclean",
  name: "MailClean",
  source: "https://github.com/ravimehra9911/mailclean",
  facts: {
    price: "Free",
    free: true,
    onDevice: true,
    noDataSale: true,
    openSource: true,
    reads: "Sender, date, size and flags — subject lines never saved",
    bulk: true,
    unsubscribe: true,
    rules: true,
    apps: "macOS, Windows, Linux",
    outlook: "Coming soon",
  },
};

export const COMPETITORS: Tool[] = [
  {
    id: "clean-email", name: "Clean Email", source: "https://clean.email/plans",
    facts: {
      price: "From ₹732/month", free: false, onDevice: false, noDataSale: true, openSource: false,
      reads: "Headers, incl. subject lines", bulk: true, unsubscribe: true, rules: true,
      apps: "iPhone, Android, Mac, web", outlook: true,
    },
  },
  {
    id: "unroll-me", name: "Unroll.Me", source: "https://unroll.me/",
    facts: {
      price: "Free", free: true, onDevice: false,
      noDataSale: "No — “we use your data to fuel our market research business, NielsenIQ”", openSource: false,
      reads: "Your inbox, for NielsenIQ research", bulk: false, unsubscribe: "Block senders", rules: "Daily digest (Rollup)",
      apps: "Web + app", outlook: true,
    },
  },
  {
    id: "cleanfox", name: "Cleanfox", source: "https://www.cleanfox.io/",
    facts: {
      price: "Free", free: true, onDevice: false,
      noDataSale: "No — “to keep Cleanfox free, we sell data for statistical purposes”", openSource: false,
      reads: "Newsletters and transactional emails, for statistics", bulk: "Newsletters", unsubscribe: true, rules: "Auto-delete a newsletter",
      apps: "Web, iPhone, Android", outlook: true,
    },
  },
  {
    id: "sanebox", name: "SaneBox", source: "https://www.sanebox.com/pricing",
    facts: {
      price: "From $2.04/month (billed every 2 years)", free: false, onDevice: false, noDataSale: true, openSource: false,
      reads: "Headers (some optional features read bodies, not stored)", bulk: "Deep Clean", unsubscribe: "SaneBlackHole", rules: true,
      apps: "Web, iPhone, Android (works with any mail app)", outlook: true,
    },
  },
  {
    id: "mailstrom", name: "Mailstrom", source: "https://mailstrom.co/pricing/",
    facts: {
      price: "From $9/month ($59.95/year)", free: false, onDevice: false, noDataSale: "Not stated", openSource: false,
      reads: "Stores subject lines and metadata", bulk: true, unsubscribe: true, rules: "Block senders and subjects",
      apps: "Web", outlook: true,
    },
  },
  {
    id: "chuck", name: "Chuck", source: "https://chuck.email/",
    facts: {
      price: "Free tier; Pro $5.99/month", free: "Free tier (1 account)", onDevice: true, noDataSale: true, openSource: false,
      reads: "Processed on your phone", bulk: true, unsubscribe: true, rules: "Pro: filters and blocking",
      apps: "iPhone, iPad, Mac", outlook: true,
    },
  },
];

export const CHECKED = "October 2026";
