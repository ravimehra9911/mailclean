import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Analytics } from "@/components/site/Analytics";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Comparison page for search ("Clean Email alternative"). Facts about Clean Email come from clean.email
// (home and plans pages) as of October 2026 — re-check them before changing this page.

const TITLE = "MailClean vs Clean Email — a free, private alternative";
const DESCRIPTION = "Compare MailClean and Clean Email: price, privacy, features and platforms. MailClean is free, open source and runs on your computer, so your email never goes to a company server.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vs/clean-email" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/vs/clean-email", siteName: SITE_NAME, type: "article",
    images: [{ url: "/screenshots/overview-dark.png", width: 1440, height: 900 }] },
};

type Cell = string | boolean;
const ROWS: { label: string; mc: Cell; ce: Cell; note?: string }[] = [
  { label: "Price", mc: "Free", ce: "From ₹732/month (1 account); ₹2,182/month for 10", note: "Clean Email prices as shown on clean.email/plans in India, paying monthly." },
  { label: "Open source", mc: true, ce: false },
  { label: "Where your mail is processed", mc: "On your computer", ce: "On Clean Email's servers (in the cloud)" },
  { label: "What is read", mc: "Sender, date, size, flags and unsubscribe link — never subjects", ce: "Email headers, including subject lines, senders and recipients" },
  { label: "Your data on a company server", mc: "None — there is no MailClean server", ce: "Kept up to 45 days, per Clean Email" },
  { label: "Bulk trash / archive by sender", mc: true, ce: true },
  { label: "Unsubscribe (incl. bulk)", mc: true, ce: true },
  { label: "Block senders without an unsubscribe link", mc: "Yes — “Always trash” rules", ce: true },
  { label: "Automatic clean-up rules", mc: "Yes — after each sync, while the app is open", ce: "Yes — Auto Clean runs in their cloud, even when your computer is off" },
  { label: "Keep the newest emails from a sender", mc: true, ce: true },
  { label: "Cleaning suggestions", mc: true, ce: true },
  { label: "Gmail tab filter (Promotions, Social…)", mc: true, ce: "Smart Folders group mail by type" },
  { label: "Screener for new senders", mc: false, ce: true },
  { label: "Apps", mc: "macOS, Windows, Linux (+ web demo)", ce: "iPhone, iPad, Android, Mac, web" },
  { label: "Mail providers", mc: "Gmail, Yahoo, iCloud, AOL, Zoho, any IMAP (Outlook coming)", ce: "Gmail, Yahoo, Outlook/Hotmail, AOL, iCloud, work email" },
];

function Value({ v }: { v: Cell }) {
  if (v === true) return <span className="font-semibold text-ok">✓ Yes</span>;
  if (v === false) return <span className="text-subtle">✕ No</span>;
  return <>{v}</>;
}

export default function VsCleanEmail() {
  return (
    <div className="min-h-screen">
      <Analytics />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">✦</span> MailClean
          </a>
          <div className="ml-auto flex items-center gap-4 text-sm text-subtle">
            <a href="/#download" className="hidden hover:text-ink sm:inline">Download</a>
            <a href="/demo" className="hidden hover:text-ink sm:inline">Live demo</a>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-sm font-medium text-accent">Comparison</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">MailClean vs Clean Email</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-subtle">
          Both clean up a crowded inbox: see who sends the most, delete in bulk, unsubscribe and automate the rest.
          The big difference is <b className="text-ink">where your email goes</b>. Clean Email is a paid cloud service
          that scans your mailbox on its servers. MailClean is a free, open-source app that does everything on your own
          computer.
        </p>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left">
              <tr>
                <th className="w-1/3 px-5 py-3 font-medium text-subtle"></th>
                <th className="px-5 py-3 font-semibold text-accent">MailClean</th>
                <th className="px-5 py-3 font-semibold">Clean Email</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-medium">
                    {r.label}{r.note && <sup className="ml-0.5 text-subtle">*</sup>}
                  </th>
                  <td className="bg-accent/5 px-5 py-3"><Value v={r.mc} /></td>
                  <td className="px-5 py-3"><Value v={r.ce} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-subtle">
          * {ROWS.find((r) => r.note)?.note} Information about Clean Email is taken from clean.email in October 2026 and may have changed.
          Clean Email is a trademark of its owner; MailClean is not affiliated with it.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-accent/40 bg-accent/5 p-6">
            <h2 className="text-xl font-semibold">Choose MailClean if…</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed">
              <li>✓ You don&apos;t want your mailbox scanned on someone else&apos;s server</li>
              <li>✓ You want it free, with no subscription or account limits</li>
              <li>✓ You use Gmail, Yahoo, iCloud, AOL or Zoho on a Mac, Windows or Linux computer</li>
              <li>✓ You like being able to read the code that touches your email</li>
            </ul>
          </section>
          <section className="rounded-2xl border border-line bg-card p-6">
            <h2 className="text-xl font-semibold">Clean Email may suit you better if…</h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-subtle">
              <li>• You mainly clean up on your phone (iPhone or Android)</li>
              <li>• You need Outlook or Hotmail today</li>
              <li>• You want rules running 24/7 even when your computer is off</li>
              <li>• You want a Screener that holds back first-time senders</li>
            </ul>
          </section>
        </div>

        <section className="mt-14 rounded-2xl border border-line bg-card p-8 text-center">
          <h2 className="text-2xl font-semibold">Try MailClean free</h2>
          <p className="mx-auto mt-2 max-w-xl text-subtle">No account, no subscription. Download the app, or try the web demo with sample data first.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/#download" data-track="cta_download" className="inline-flex h-11 items-center rounded-xl bg-accent px-6 font-medium text-white hover:opacity-90">Download free</a>
            <a href="/demo" data-track="open_demo" className="inline-flex h-11 items-center rounded-xl border border-line px-6 font-medium hover:bg-muted">Try the live demo →</a>
          </div>
        </section>
      </main>
    </div>
  );
}
