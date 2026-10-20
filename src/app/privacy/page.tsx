import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Analytics, AnalyticsSettings } from "@/components/site/Analytics";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Privacy policy for the MailClean app and website (also used for the Microsoft Store listing).
// Keep it in line with what the code does: src/lib/providers/*, src/components/site/Analytics.tsx.

const TITLE = "Privacy Policy — MailClean";
const DESCRIPTION = "How MailClean handles your data: the app runs on your computer, reads only email metadata, and never sends your email data to us or anyone else.";
const ISSUES = "https://github.com/ravimehra9911/mailclean/issues";
const SUPPORT_EMAIL = "support@mailclean.app";
const EFFECTIVE = "20 October 2026";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/privacy", siteName: SITE_NAME, type: "article" },
};

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 scroll-mt-24 text-2xl font-semibold">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 text-lg font-semibold">{children}</h3>;
}

export default function PrivacyPolicy() {
  const ul = "mt-3 list-disc space-y-1.5 pl-6";
  const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]";
  return (
    <div className="min-h-screen">
      <Analytics />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <img src="/brand/mailclean-mark.png" alt="" width={50} height={28} className="h-7 w-auto" /> MailClean
          </a>
          <div className="ml-auto flex items-center gap-4 text-sm text-subtle">
            <a href="/#download" className="hidden hover:text-ink sm:inline">Download</a>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 leading-relaxed">
        <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-subtle">Effective date: {EFFECTIVE}</p>

        <p className="mt-6">
          MailClean is a free, open-source app for cleaning up email inboxes, made by Ravi Kumar. This policy explains what the
          MailClean app and the website <a href="/" className="text-accent hover:underline">www.mailclean.app</a> do with your information.
        </p>
        <div className="mt-6 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4">
          <b>In short:</b> the MailClean app runs entirely on your computer. There is no MailClean server or account. Your email data
          is never sent to us or to anyone else, and we do not sell, share or analyse it.
        </div>

        <nav aria-label="On this page" className="mt-8 text-sm">
          <ol className="list-decimal space-y-1 pl-6 text-accent">
            <li><a href="#app" className="hover:underline">The MailClean app</a></li>
            <li><a href="#website" className="hover:underline">The website</a></li>
            <li><a href="#children" className="hover:underline">Children</a></li>
            <li><a href="#rights" className="hover:underline">Your choices and rights</a></li>
            <li><a href="#changes" className="hover:underline">Changes to this policy</a></li>
            <li><a href="#contact" className="hover:underline">Contact</a></li>
          </ol>
        </nav>

        <H2 id="app">1. The MailClean app</H2>

        <H3>What the app reads</H3>
        <p className="mt-2">
          When you connect an email account, MailClean connects <b>directly from your computer to your email provider</b> (for example
          Gmail, Yahoo, iCloud, AOL or Zoho) over an encrypted connection. For each email, it reads only:
        </p>
        <ul className={ul}>
          <li>the sender&apos;s address and name</li>
          <li>the date and size</li>
          <li>whether it is read, starred, marked important, in your inbox, and (for Gmail) which tab it is in</li>
          <li>the sender&apos;s unsubscribe link (the “List-Unsubscribe” header)</li>
        </ul>
        <p className="mt-3">
          MailClean <b>does not save or show subject lines</b>, and it <b>never downloads message text or attachments</b>. For most
          providers, MailClean asks only for the fields listed above. Yahoo and AOL only send the whole header block, so MailClean picks
          out the sender and unsubscribe link and discards the rest.
        </p>

        <H3>Where your data is stored</H3>
        <p className="mt-2">Everything MailClean saves stays <b>on your computer</b>, in the app&apos;s data folder:</p>
        <ul className={ul}>
          <li>macOS: <code className={code}>~/Library/Application Support/MailClean</code></li>
          <li>Windows: <code className={code}>%APPDATA%\MailClean</code></li>
          <li>Linux: <code className={code}>~/.config/MailClean</code></li>
        </ul>
        <p className="mt-3">
          Your app passwords are encrypted (AES-256-GCM) before they are saved. If you turn on the optional app lock, your PIN is stored
          only as a secure one-way hash.
        </p>

        <H3>What the app changes</H3>
        <p className="mt-2">MailClean only changes your mailbox when you tell it to:</p>
        <ul className={ul}>
          <li><b>Move to Trash</b> or <b>Archive</b> emails you select</li>
          <li><b>Unsubscribe</b> from senders you choose</li>
          <li>Apply <b>rules</b> that you create</li>
        </ul>
        <p className="mt-3">Trashed email goes to your provider&apos;s Trash folder, where it can normally be restored for about 30 days.</p>

        <H3>Network connections the app makes</H3>
        <ul className={ul}>
          <li><b>Your email provider</b>, to read the information above and carry out actions you request.</li>
          <li>
            <b>Unsubscribe links</b>, when you unsubscribe. MailClean sends the sender&apos;s own unsubscribe request, or opens their
            unsubscribe page in your browser. The sender receives that request as it would from any email app.
          </li>
          <li><b>GitHub</b>, to check whether a newer version of MailClean is available. Only the version check is sent; no email data is included.</li>
          <li><b>Links you click</b> (for example your provider&apos;s account settings) open in your web browser.</li>
        </ul>
        <p className="mt-3">MailClean contains <b>no analytics, tracking, advertising or crash reporting</b>.</p>

        <H3>Sharing</H3>
        <p className="mt-2">We <b>do not receive</b> your email data, so we cannot share or sell it. No third party receives your email data from MailClean.</p>

        <H3>Deleting your data</H3>
        <ul className={ul}>
          <li><b>Accounts → Disconnect</b> removes that account&apos;s password and scanned data from your computer.</li>
          <li><b>Reset MailClean</b> (from the app lock screen) removes all accounts, data and settings.</li>
          <li><b>Uninstalling</b> MailClean and deleting the data folder above removes everything.</li>
        </ul>
        <p className="mt-3">To stop access completely, also delete the app password at your email provider.</p>

        <H2 id="website">2. The website (www.mailclean.app)</H2>
        <ul className={ul}>
          <li>
            <b>Hosting:</b> The website is hosted by Vercel, which keeps standard server logs (such as IP address, browser type and pages
            requested) to run and secure the service.
          </li>
          <li>
            <b>Analytics (only with your consent):</b> If you accept cookies, the website uses Google Analytics to count visits and clicks
            on download buttons. If you decline, analytics is not loaded. You can change your choice any time with “Analytics settings”
            at the bottom of this page.
          </li>
          <li>
            <b>Live demo:</b> The demo uses sample data only. Changes you make in the demo are stored in a cookie in your browser, and
            nothing from your real email is involved.
          </li>
          <li><b>Download counts:</b> Your browser loads public download numbers from GitHub.</li>
        </ul>

        <H2 id="children">3. Children</H2>
        <p className="mt-3">MailClean is not directed at children under 13, and we do not knowingly collect information from children.</p>

        <H2 id="rights">4. Your choices and rights</H2>
        <p className="mt-3">
          Because the app keeps your data on your own computer, you control it completely: you can view it in the app, disconnect
          accounts or delete it at any time. For website analytics, you can decline or withdraw consent in “Analytics settings”. If you
          have a request under data-protection laws (such as GDPR or India&apos;s DPDP Act), contact us using the details below.
        </p>

        <H2 id="changes">5. Changes to this policy</H2>
        <p className="mt-3">If this policy changes, we will update it on this page and change the effective date above.</p>

        <H2 id="contact">6. Contact</H2>
        <p className="mt-3">
          Questions about privacy: email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>
          {" "}or open an issue at{" "}
          <a href={ISSUES} className="text-accent hover:underline">github.com/ravimehra9911/mailclean/issues</a>.
        </p>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-subtle">
          <a href="/" className="font-medium text-ink">MailClean</a>
          <span>MIT License</span>
          <AnalyticsSettings />
        </div>
      </footer>
    </div>
  );
}
