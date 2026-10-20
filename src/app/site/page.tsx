import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Analytics, AnalyticsSettings } from "@/components/site/Analytics";
import { getDownloadCounts, type InstallerKey } from "@/lib/downloads";
import { HeroVideo } from "@/components/site/HeroVideo";
import { DownloadCountsProvider, DownloadTotal } from "@/components/site/DownloadCounts";
import { PROVIDER_LOGOS } from "@/components/site/ProviderLogos";
import { StructuredData } from "@/components/site/StructuredData";
import { DOWNLOADS, dl, INSTALL, MS_STORE_URL, WindowsIcon } from "@/components/site/Platforms";
import { CompareTable } from "@/components/site/CompareTable";
import { Gallery } from "@/components/site/Gallery";
import { DESCRIPTION, DEVELOPER, GOOGLE_SITE_VERIFICATION, KEYWORDS, SITE_NAME, SITE_URL, TITLE } from "@/lib/site";
import { CleanupDemo, CountUp, Downloads, Reveal, ScrollProgress, SpotlightGrid, Tilt } from "@/components/site/Effects";

// Landing page for the hosted website (served at "/" on Vercel; see src/middleware.ts).

const REPO = "https://github.com/ravimehra9911/mailclean";
const GITHUB_USER = "https://github.com/ravimehra9911";
const VERSION = process.env.MAILCLEAN_VERSION ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: DEVELOPER.name, url: DEVELOPER.url }],
  creator: DEVELOPER.name,
  publisher: DEVELOPER.name,
  category: "productivity",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  ...(GOOGLE_SITE_VERIFICATION ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
  openGraph: {
    title: TITLE,
    description: "See who fills your inbox, bulk-delete and unsubscribe across Gmail, Yahoo, iCloud and more. Free, private, open source — runs on your computer.",
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [{ url: "/screenshots/overview-dark.png", width: 1440, height: 900, alt: "MailClean dashboard showing inbox totals and top senders" }],
    videos: [{ url: `${SITE_URL}/media/mailclean-demo.mp4`, width: 1920, height: 1080, type: "video/mp4" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Free, private inbox cleaner for Gmail, Yahoo & iCloud. Bulk-delete and unsubscribe in one click.",
    images: ["/screenshots/overview-dark.png"],
  },
};



// Rebuild the page hourly so the download counts stay current.
export const revalidate = 3600;

const STATS = [
  { value: 6, suffix: "", label: "mail providers" },
  { value: 0, suffix: "", label: "servers that see your email" },
  { value: 100, suffix: "%", label: "runs on your computer" },
  { value: 30, suffix: " days", label: "to undo any clean-up" },
];

const FEATURES = [
  { title: "See who fills your inbox", text: "Every sender ranked by number of emails, storage used and how much you never open." },
  { title: "Clean up in one click", text: "Select senders and move thousands of emails to Trash or Archive at once — starred and important emails stay. Nothing is permanently deleted." },
  { title: "Bulk unsubscribe", text: "Pick dozens of newsletters and unsubscribe from all of them. You see exactly what will happen before you confirm." },
  { title: "Rules that clean for you", text: "Always trash a sender, or archive Promotions older than 30 days — applied after every sync.", isNew: true },
  { title: "Cleaning suggestions", text: "Senders you never open, mail older than a year, your Promotions tab — one click to review each.", isNew: true },
  { title: "Gmail tabs & dates", text: "Filter by Promotions, Updates, Social… or any date range, and clean only that." },
  { title: "Save attachments in bulk", text: "Download every statement or invoice from the senders you pick — choose PDF, images or any format — to your Downloads folder.", isNew: true },
  { title: "Who has your email", text: "Every company that has your address, with security alerts, old accounts and one-click links to review app access.", isNew: true },
  { title: "Private by design", text: "Runs on your computer. Only sender, date, size and flags are saved — never subject lines or message content." },
];

// Shown as a pill in the hero; update with each feature release.
const WHATS_NEW = { version: "1.8", text: "Save attachments from any sender in bulk", href: "https://github.com/ravimehra9911/mailclean/releases/tag/v1.8.0" };


const SHOTS = [
  { src: "/screenshots/overview-dark.png", alt: "Overview with totals per account and emails per Gmail tab", caption: "Overview of every inbox and Gmail tab" },
  { src: "/screenshots/senders-light.png", alt: "Sender table sorted by number of emails with account and Gmail tab labels", caption: "Senders, sortable by any column" },
  { src: "/screenshots/gmail-promotions-dark.png", alt: "Senders filtered to Gmail's Promotions tab", caption: "Clean just your Promotions tab" },
  { src: "/screenshots/bulk-unsubscribe-light.png", alt: "Bulk unsubscribe dialog listing what will happen for each sender", caption: "Bulk unsubscribe, reviewed before it runs" },
  { src: "/screenshots/apps-access-light.png", alt: "Accounts and apps page listing companies that have your email address", caption: "See who has your email" },
  { src: "/screenshots/add-account-light.png", alt: "Add account screen with provider picker and app-password steps", caption: "Connect with an app password" },
];

const FAQ = [
  {
    q: "Is MailClean free?",
    a: "Yes. It is free and open source under the MIT license. There are no accounts, subscriptions or limits.",
  },
  {
    q: "Does MailClean read my emails?",
    a: "No. MailClean asks your provider only for each email's sender, date, size, read/starred status, Gmail tab and unsubscribe link, and saves only those. Subject lines are never saved or shown — Yahoo and AOL send the whole header block, so MailClean picks out the sender and unsubscribe link and discards the rest. Message text is never downloaded, attachments only when you ask to save them, and nothing is sent to any MailClean server — there isn't one.",
  },
  {
    q: "Can I clean only my Gmail Promotions tab?",
    a: "Yes. Pick Promotions (or Updates, Social, Forums, Purchases) in the category filter and everything — totals, senders and clean-ups — covers only that tab. Other providers have no tabs, so the filter applies to Gmail mail.",
  },
  {
    q: "Will it delete my starred or important emails?",
    a: "No. “Keep starred & important” is on by default: when you trash or archive a sender, emails you starred or Gmail marked important stay where they are. You can turn it off on the Senders page.",
  },
  {
    q: "Can MailClean clean up automatically?",
    a: "Yes. Add a rule — for example “always trash emails from this sender” or “archive Gmail Promotions older than 30 days” — and MailClean applies it after every sync, and every 6 hours while the app is open. Starred and important emails are always kept.",
  },
  {
    q: "Can MailClean show which apps have access to my account?",
    a: "MailClean links straight to Google's, Yahoo's, Apple's and Microsoft's own pages that list the apps with access to your account, so you can review and remove them there. It also lists every company that has emailed you, flags security alerts and accounts you haven't heard from in a year — built from sender addresses it already has.",
  },
  {
    q: "Can I lock MailClean with a PIN?",
    a: "Yes. In Security → App lock, set a 6-digit PIN and MailClean asks for it every time it opens; after 5 wrong tries you have to wait before trying again. If you forget it, you can reset MailClean from the lock screen — that removes your connected accounts and scanned data from the app (your mailboxes aren't changed) so you can start fresh.",
  },
  {
    q: "How does bulk unsubscribe work?",
    a: "Select the senders and click Unsubscribe. MailClean first shows which ones it can unsubscribe automatically (one-click, RFC 8058) and which need you to confirm on the sender's page, then does the automatic ones and gives you a button for each of the rest.",
  },
  {
    q: "Why an app password instead of “Sign in with Google”?",
    a: "An app password lets the app on your own computer talk directly to your mail server, with no third-party service in between. You can revoke it any time in your Google, Yahoo or Apple account settings.",
  },
  {
    q: "Does this website track me?",
    a: "Only if you accept cookies: the website then uses Google Analytics to count visits and download clicks. The MailClean app itself has no analytics or tracking of any kind.",
  },
  {
    q: "Can I undo a clean-up?",
    a: "Yes. Trash moves emails to your provider's Trash folder, where they stay for about 30 days. Archive just removes them from the inbox.",
  },
  {
    q: "Why do macOS or Windows warn me when I open it?",
    a: "MailClean is free, and code-signing certificates cost a yearly fee, so the downloads aren't signed yet. On Windows, the easiest way is to install MailClean from the Microsoft Store — it's signed by Microsoft, shows no warnings and updates itself. If you use the downloaded file, click More info → Run anyway. On macOS, open the app once, then go to System Settings → Privacy & Security and click Open Anyway.",
  },
  {
    q: "Does it work with Outlook or Hotmail?",
    a: "Not yet. Microsoft no longer allows app passwords for Outlook.com, so it needs Microsoft sign-in, which is in progress.",
  },
];

export default async function SitePage() {
  const counts = await getDownloadCounts();
  return (
    <DownloadCountsProvider initial={counts}>
    <div className="min-h-screen overflow-x-clip">
      <StructuredData faq={FAQ} version={VERSION} />
      <ScrollProgress />
      <Analytics />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <a href="#" className="flex items-center gap-2 font-semibold">
            <img src="/brand/mailclean-mark.png" alt="" width={50} height={28} className="h-7 w-auto" /> MailClean
          </a>
          <div className="ml-auto hidden items-center gap-5 text-sm text-subtle md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#screenshots" className="hover:text-ink">Screenshots</a>
            <a href="#privacy" className="hover:text-ink">Privacy</a>
            <a href="#compare" className="hover:text-ink">Compare</a>
            <a href="/download" className="hover:text-ink">Download</a>
            <a href={REPO} data-track="github" className="hover:text-ink">GitHub</a>
          </div>
          <div className="ml-auto md:ml-0"><ThemeToggle /></div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-10 text-center md:pt-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="hero-glow top-10 left-[10%] size-72 bg-accent" />
            <div className="hero-glow top-40 right-[8%] size-80 bg-[#c084fc]" style={{ animationDelay: "-6s" }} />
            <div className="hero-glow top-[28rem] left-[35%] size-96 bg-[#60a5fa]" style={{ animationDelay: "-12s" }} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a href={WHATS_NEW.href} data-track="whats_new" className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs hover:border-accent">
              <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-white">NEW {WHATS_NEW.version}</span>
              {WHATS_NEW.text} →
            </a>
            <a href={REPO} data-track="github" className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-subtle hover:text-ink">
              <GitHubIcon className="size-3.5" /> Free &amp; open source · MIT license
            </a>
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            Clean up every inbox <span className="shimmer-text">in one place</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-subtle">
            See which senders fill your Gmail, Yahoo and iCloud inboxes, sort them by Gmail tab, unsubscribe from
            newsletters in bulk and clear thousands of emails in a click. Everything runs on your computer — your
            email never leaves it.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#download" data-track="cta_download" className="inline-flex h-12 items-center rounded-xl bg-accent px-6 font-medium text-white shadow-lg shadow-accent/25 hover:opacity-90">
              Download free
            </a>
            <a href="/demo" data-track="open_demo" className="inline-flex h-12 items-center rounded-xl border border-line bg-card px-6 font-medium hover:bg-muted">
              Try the live demo →
            </a>
          </div>
          <p className="mt-3 text-xs text-subtle">
            macOS · Windows · Linux{VERSION && ` · v${VERSION}`}
            <DownloadTotal />
          </p>
          <a href={MS_STORE_URL} target="_blank" rel="noopener noreferrer" data-track="store" data-track-label="hero"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium hover:border-accent hover:text-accent">
            <WindowsIcon className="size-4" /> Get it from Microsoft Store
            <span className="text-xs font-normal text-subtle">· no security warnings</span>
          </a>
          <Tilt className="mx-auto mt-12 max-w-5xl">
            <div className="float overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-accent/20">
              <HeroVideo src="/media/mailclean-demo.mp4" poster="/screenshots/overview-dark.png"
                alt="MailClean demo: filtering by year, sorting senders, trashing thousands of emails and unsubscribing" />
            </div>
          </Tilt>
        </section>

        {/* Providers */}
        <section className="border-y border-line bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-6 text-sm text-subtle">
            <span className="font-medium text-ink">Works with</span>
            {PROVIDER_LOGOS.map((p) => (
              <span key={p.name} className="flex items-center gap-2 transition hover:text-ink">{p.logo}{p.name}</span>
            ))}
          </div>
        </section>

        {/* Try it + stats */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center">
          <Reveal>
            <h2 className="text-3xl font-semibold">Thousands of emails, gone in one click</h2>
            <p className="mt-4 leading-relaxed text-subtle">
              Newsletters and promotions pile up for years. MailClean shows which senders they come from and
              clears all of them at once. Try it here.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-4">
              {STATS.map((st) => (
                <div key={st.label} className="rounded-xl border border-line bg-card p-4">
                  <dt className="text-2xl font-semibold text-accent"><CountUp to={st.value} suffix={st.suffix} /></dt>
                  <dd className="mt-1 text-xs text-subtle">{st.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal delay={150}><CleanupDemo /></Reveal>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <Reveal><h2 className="text-center text-3xl font-semibold">Everything you need to tame your inbox</h2></Reveal>
          <SpotlightGrid className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 100}>
                <div className="spot relative h-full overflow-hidden rounded-2xl border border-line bg-card p-6 transition hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl">
                  <h3 className="relative flex items-center gap-2 font-semibold">
                    {f.title}
                    {"isNew" in f && f.isNew && <span className="rounded-full bg-accent/15 px-2 py-px text-[10px] font-semibold text-accent">NEW</span>}
                  </h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-subtle">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </SpotlightGrid>
        </section>

        {/* Screenshots */}
        <section id="screenshots" className="scroll-mt-20 border-y border-line bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-center text-3xl font-semibold">See it in action</h2>
            <p className="mt-3 text-center text-subtle">Light and dark mode, on every platform. Shown with sample data.</p>
            <Gallery shots={SHOTS} />
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold">Up and running in two minutes</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Download MailClean", "Install the free app for macOS, Windows or Linux."],
              ["Create an app password", "MailClean shows the exact steps for Gmail, Yahoo, iCloud and others."],
              ["Clean up", "See your biggest senders and Gmail tabs, unsubscribe in bulk and clear thousands of emails at once."],
            ].map(([t, d], i) => (
              <li key={t}>
                <Reveal delay={i * 120} className="h-full">
                  <div className="h-full rounded-2xl border border-line bg-card p-6 transition hover:-translate-y-1 hover:shadow-xl">
                    <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-white">{i + 1}</span>
                    <h3 className="mt-4 font-semibold">{t}</h3>
                    <p className="mt-2 text-sm text-subtle">{d}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-y border-line bg-card/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold">Your email stays yours</h2>
              <p className="mt-4 leading-relaxed text-subtle">
                Most inbox cleaners run on someone else&apos;s server and read your mail to do it. MailClean is different:
                it runs entirely on your computer and talks directly to your email provider.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                "No MailClean server, account or tracking",
                "Saves only sender, date, size and flags — never subjects or content",
                "Starred and important emails are kept when you clean up",
                "Optional 6-digit PIN locks the app on shared computers",
                "Passwords encrypted on your device (AES-256-GCM)",
                "Nothing permanently deleted — Trash keeps mail for ~30 days",
                "Open source: anyone can check the code",
              ].map((t, i) => (
                <li key={t}>
                  <Reveal delay={i * 80}>
                    <div className="flex gap-3 rounded-xl border border-line bg-card px-4 py-3 transition hover:translate-x-1 hover:border-ok/50">
                      <span className="text-ok">✓</span> {t}
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Compare */}
        <section id="compare" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20">
          <h2 className="text-center text-3xl font-semibold">How MailClean compares</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-subtle">
            Most inbox cleaners scan your mailbox from their servers — and some free ones pay for it with your data.
          </p>
          <Reveal className="mt-10"><CompareTable compact /></Reveal>
          <p className="mt-4 text-center text-sm">
            <a href="/compare" className="font-medium text-accent underline-offset-2 hover:underline">See the full comparison with prices and sources →</a>
          </p>
        </section>

        {/* Download */}
        <section id="download" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center text-3xl font-semibold">Download MailClean</h2>
          <p className="mt-3 text-center text-subtle">Free for everyone{VERSION && ` · version ${VERSION}`}</p>
          <Reveal className="mt-10">
            <Downloads items={DOWNLOADS.map((d) => ({
              os: d.os, detail: d.detail, key: d.key, arch: "arch" in d ? d.arch : undefined, href: dl(d.file),
              id: d.id, downloads: counts.byInstaller[d.id as InstallerKey], icon: <d.Icon className="size-8 text-ink" />,
              install: INSTALL[d.key],
            }))} />
          </Reveal>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
            <span><b>On Windows?</b> <span className="text-subtle">Get it from the Microsoft Store — no security warnings, automatic updates.</span></span>
            <a href={MS_STORE_URL} target="_blank" rel="noopener noreferrer" data-track="store" data-track-label="landing-download">
              <img src="/install/microsoft-store-badge.svg" alt="Get it from Microsoft Store" width={161} height={44} className="h-10 w-auto" />
            </a>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-card p-6 text-center">
            <div className="font-semibold">Just want to look first?</div>
            <p className="mt-1 text-sm text-subtle">The web demo runs in your browser with sample data — no download, no sign-in.</p>
            <a href="/demo" data-track="open_demo" className="mt-4 inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Open the web demo →</a>
          </div>
          <p className="mt-6 text-center text-xs text-subtle">
            First launch steps are under “How to install” on each card. On Windows, the Microsoft Store version installs with no warnings.
            {" "}<a href={`${REPO}/releases`} className="underline">All releases</a>
          </p>
        </section>

        {/* Open source */}
        <section className="border-y border-line bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center">
            <GitHubIcon className="size-10" />
            <h2 className="text-3xl font-semibold">Open source</h2>
            <p className="max-w-xl text-subtle">
              MailClean is MIT-licensed. Read the code, report issues, suggest features or contribute on GitHub.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={REPO} data-track="github" className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-bg hover:opacity-90">
                <GitHubIcon className="size-4" /> Star on GitHub
              </a>
              <a href={`${REPO}/issues`} data-track="report_issue" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Report an issue</a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-center text-3xl font-semibold">FAQs</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-card">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="mr-2 inline-block text-subtle transition group-open:rotate-90">›</span>{f.q}
                </summary>
                <p className="mt-2 pl-5 text-sm leading-relaxed text-subtle">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-subtle">
          <span className="flex items-center gap-2 font-medium text-ink">
            <img src="/brand/mailclean-mark.png" alt="" width={36} height={20} className="h-5 w-auto" /> MailClean
          </span>
          <span>MIT License</span>
          <a href="/compare" className="hover:text-ink">Compare</a>
          <a href="/download" className="hover:text-ink">Download</a>
          <a href="/privacy" className="hover:text-ink">Privacy policy</a>
          <AnalyticsSettings />
          <a href={GITHUB_USER} className="ml-auto flex items-center gap-2 hover:text-ink">
            <GitHubIcon className="size-4" /> Built by <b className="font-medium text-ink">@ravimehra9911</b>
          </a>
        </div>
      </footer>
    </div>
    </DownloadCountsProvider>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
