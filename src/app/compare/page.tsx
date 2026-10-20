import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Analytics } from "@/components/site/Analytics";
import { CompareTable } from "@/components/site/CompareTable";
import { CHECKED, COMPETITORS } from "@/lib/competitors";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "Best inbox cleaners compared: MailClean vs Clean Email, Unroll.Me, Cleanfox, SaneBox & more";
const DESCRIPTION = "Side-by-side comparison of email cleaners — price, privacy, where your email is processed, unsubscribe, bulk delete and rules. MailClean is free, open source and runs on your computer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/compare", siteName: SITE_NAME, type: "article",
    images: [{ url: "/screenshots/overview-dark.png", width: 1440, height: 900 }] },
};

export default function ComparePage() {
  return (
    <div className="min-h-screen">
      <Analytics />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <img src="/brand/mailclean-mark.png" alt="" width={50} height={28} className="h-7 w-auto" /> MailClean
          </a>
          <div className="ml-auto flex items-center gap-4 text-sm text-subtle">
            <a href="/download" className="hidden hover:text-ink sm:inline">Download</a>
            <a href="/demo" className="hidden hover:text-ink sm:inline">Live demo</a>
            <a href="/privacy" className="hidden hover:text-ink sm:inline">Privacy</a>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-14">
        <p className="text-sm font-medium text-accent">Comparison</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">How MailClean compares</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-subtle">
          Most inbox cleaners are cloud services: they connect to your mailbox from their servers, and some free ones pay
          for themselves with data from your email. MailClean runs on your own computer, is free and open source, and
          never saves your subject lines.
        </p>

        <div className="mt-10"><CompareTable /></div>

        <div className="mt-4 text-xs leading-relaxed text-subtle">
          <p>
            Facts about other services are taken from their own websites in {CHECKED} and may have changed; quotes are
            from those sites. “—” means we found no statement about it on their website.
            Product names are trademarks of their owners; MailClean is not affiliated with them.
          </p>
          <p className="mt-2">
            Sources:{" "}
            {COMPETITORS.map((c, i) => (
              <span key={c.id}>{i > 0 && " · "}<a href={c.source} rel="nofollow noopener" className="underline hover:text-ink">{c.name}</a></span>
            ))}
          </p>
        </div>

        <section className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["Free, without selling your data", "Unroll.Me and Cleanfox are free because they use what's in your inbox for NielsenIQ's market research. MailClean is free because it's open source — it never sees your email on a server."],
            ["Nothing to upload", "Clean Email, SaneBox and Mailstrom scan your mailbox from their servers. MailClean talks to Gmail, Yahoo or iCloud straight from your computer."],
            ["Desktop, not just phone", "Chuck also keeps mail on your device, but it's iPhone, iPad and Mac only. MailClean runs on macOS, Windows and Linux."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-semibold">{t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-subtle">{d}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-line bg-card p-8 text-center">
          <h2 className="text-2xl font-semibold">Try MailClean free</h2>
          <p className="mx-auto mt-2 max-w-xl text-subtle">No account, no subscription. Download the app, or try the web demo with sample data first.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/download" data-track="cta_download" className="inline-flex h-11 items-center rounded-xl bg-accent px-6 font-medium text-white hover:opacity-90">Download free</a>
            <a href="/demo" data-track="open_demo" className="inline-flex h-11 items-center rounded-xl border border-line px-6 font-medium hover:bg-muted">Try the live demo →</a>
          </div>
        </section>
      </main>
    </div>
  );
}
