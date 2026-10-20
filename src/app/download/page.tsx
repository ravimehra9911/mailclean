import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Analytics, AnalyticsSettings } from "@/components/site/Analytics";
import { DownloadCountsProvider, DownloadTotal } from "@/components/site/DownloadCounts";
import { Downloads } from "@/components/site/Effects";
import { DOWNLOADS, dl, INSTALL, MS_STORE_URL } from "@/components/site/Platforms";
import { getDownloadCounts, type InstallerKey } from "@/lib/downloads";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Download page: installers for every platform (each card has a "How to install" popup) and other ways to get MailClean.

const REPO = "https://github.com/ravimehra9911/mailclean";
const VERSION = process.env.MAILCLEAN_VERSION ?? "";
const TITLE = "Download MailClean — free for macOS, Windows and Linux";
const DESCRIPTION = "Download MailClean, the free and private inbox cleaner, for macOS (Apple Silicon and Intel), Windows 10/11 and Linux.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/download" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/download", siteName: SITE_NAME, type: "website",
    images: [{ url: "/screenshots/overview-dark.png", width: 1440, height: 900 }] },
};

// Rebuild hourly so the download counts stay current.
export const revalidate = 3600;


export default async function DownloadPage() {
  const counts = await getDownloadCounts();
  return (
    <DownloadCountsProvider initial={counts}>
      <div className="min-h-screen">
        <Analytics />
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <a href="/" className="flex items-center gap-2 font-semibold">
              <img src="/brand/mailclean-mark.png" alt="" width={50} height={28} className="h-7 w-auto" /> MailClean
            </a>
            <div className="ml-auto flex items-center gap-4 text-sm text-subtle">
              <a href="/demo" className="hidden hover:text-ink sm:inline">Live demo</a>
              <a href="/compare" className="hidden hover:text-ink sm:inline">Compare</a>
              <ThemeToggle />
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-14">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Download MailClean</h1>
            <p className="mt-3 text-lg text-subtle">
              Free and open source{VERSION && ` · version ${VERSION}`}
              <DownloadTotal />
            </p>
          </div>

          <div className="mt-10">
            <Downloads items={DOWNLOADS.map((d) => ({
              os: d.os, detail: d.detail, key: d.key, arch: "arch" in d ? d.arch : undefined, href: dl(d.file),
              id: d.id, downloads: counts.byInstaller[d.id as InstallerKey], icon: <d.Icon className="size-8 text-ink" />,
              install: INSTALL[d.key],
            }))} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
            <span><b>On Windows?</b> <span className="text-subtle">Get MailClean from the Microsoft Store — no security warnings, automatic updates.</span></span>
            <a href={MS_STORE_URL} target="_blank" rel="noopener noreferrer" data-track="store" data-track-label="download-page">
              <img src="/install/microsoft-store-badge.svg" alt="Get it from Microsoft Store" width={161} height={44} className="h-10 w-auto" />
            </a>
          </div>
          <p className="mt-4 text-center text-sm text-subtle">
            Not sure which Mac you have? Apple menu → About This Mac: “Apple M…” means Apple Silicon, “Intel” means Intel.
          </p>


          <section className="mt-16 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-semibold">After installing</h2>
              <p className="mt-2 text-sm leading-relaxed text-subtle">
                Connect your mailbox with an app password — MailClean shows the exact steps for Gmail, Yahoo, iCloud, AOL and Zoho.
                Your email stays on your computer; see the <a href="/privacy" className="text-accent hover:underline">privacy policy</a>.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-semibold">Updates</h2>
              <p className="mt-2 text-sm leading-relaxed text-subtle">
                MailClean tells you when a new version is out (About → Updates). Download it here and install it over the old one —
                your accounts and settings are kept. The Microsoft Store version updates itself.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-semibold">Other ways to get it</h2>
              <ul className="mt-2 space-y-1 text-sm text-subtle">
                <li><a href={`${REPO}/releases`} className="text-accent hover:underline">All releases and release notes</a></li>
                <li><a href={REPO} className="text-accent hover:underline">Source code on GitHub</a> (MIT license) — build it yourself</li>
                <li><a href="/demo" className="text-accent hover:underline">Try the live demo</a> in your browser first</li>
              </ul>
            </div>
          </section>
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-subtle">
            <a href="/" className="font-medium text-ink">MailClean</a>
            <span>MIT License</span>
            <a href="/privacy" className="hover:text-ink">Privacy policy</a>
            <AnalyticsSettings />
          </div>
        </footer>
      </div>
    </DownloadCountsProvider>
  );
}
