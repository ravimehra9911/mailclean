"use client";

// Support pages: Help (tours and quick answers), Privacy, and About (app, updates, developer).

import { AppLockSettings } from "./AppLock";
import { IconBug, IconCompass, IconExternal, IconGitHub, IconPlusCircle } from "./Icons";
import type { TourKind } from "./Tour";
import { UpdateSection, type UpdateInfo } from "./Updates";

const REPO = "https://github.com/ravimehra9911/mailclean";
const SITE = "https://www.mailclean.app";
const card = "rounded-xl border border-line bg-card p-5";

function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-subtle">{sub}</p>
    </header>
  );
}

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

// ---------------------------------------------------------------- Help

const FAQ = [
  {
    q: "Why does MailClean ask for an app password?",
    a: "An app password is a separate password just for MailClean. It lets the app on your computer read your mailbox directly, and you can revoke it any time in your Google, Yahoo or Apple account — without changing your real password.",
  },
  {
    q: "Where do trashed emails go? Can I get them back?",
    a: "They move to your provider's Trash folder, where they stay for about 30 days. Open Trash in Gmail, Yahoo or iCloud to restore anything. Archive only removes emails from the inbox.",
  },
  {
    q: "Why does Yahoo or AOL show only 10,000 emails?",
    a: "Yahoo and AOL only let apps see the newest 10,000 emails in each folder. As you clean up, older emails move into view — MailClean rescans automatically after each clean-up.",
  },
  {
    q: "How do I remove an account?",
    a: "Go to Accounts and click Disconnect. That deletes its password and scanned data from this computer. To revoke access completely, also delete the app password at your provider.",
  },
  {
    q: "How do I update MailClean?",
    a: "MailClean checks for new versions automatically and shows a banner. You can also check now under About → Check for updates. Install the new version over the old one; your accounts are kept.",
  },
];

export function HelpPage({ onTour }: { onTour: (k: TourKind) => void }) {
  return (
    <div className="max-w-3xl space-y-6 text-sm">
      <PageTitle title="Help" sub="Guided tours and answers to common questions." />

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { kind: "intro" as const, Icon: IconCompass, title: "Take the tour", text: "A one-minute walkthrough of every part of MailClean.", cta: "Start tour" },
          { kind: "add-account" as const, Icon: IconPlusCircle, title: "How to add an account", text: "Create an app password and connect your inbox, step by step.", cta: "Start guide" },
        ].map((t) => (
          <button key={t.kind} onClick={() => onTour(t.kind)}
            className="group flex flex-col items-start rounded-xl border border-line bg-card p-5 text-left transition hover:border-accent/60 hover:shadow-md">
            <span className="grid size-10 place-items-center rounded-lg bg-accent/10 text-accent"><t.Icon className="size-5" /></span>
            <span className="mt-4 font-semibold">{t.title}</span>
            <span className="mt-1 text-subtle">{t.text}</span>
            <span className="mt-4 font-medium text-accent">{t.cta} <span className="inline-block transition group-hover:translate-x-0.5">→</span></span>
          </button>
        ))}
      </div>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Quick answers</h2>
        <div className="divide-y divide-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
                {f.q}
                <span aria-hidden className="text-subtle transition group-open:rotate-90">›</span>
              </summary>
              <p className="mt-2 leading-relaxed text-subtle">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${card} flex flex-wrap items-center gap-4`}>
        <span className="grid size-10 place-items-center rounded-lg bg-muted text-subtle"><IconBug className="size-5" /></span>
        <div className="min-w-48 flex-1">
          <div className="font-semibold">Something not working?</div>
          <div className="text-subtle">Report a bug or suggest a feature on GitHub.</div>
        </div>
        <a href={`${REPO}/issues`} {...ext} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-muted">
          Open an issue <IconExternal />
        </a>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Privacy

export function PrivacyPage({ dataDir }: { dataDir: string }) {
  const sections = [
    {
      title: "What MailClean reads",
      body: <>For each email, MailClean asks your provider only for the sender, date, size, read/inbox/starred status, Gmail tab (Promotions, Updates…) and unsubscribe link, and saves only those. Subject lines are never saved or shown — Yahoo and AOL send the whole header block, so MailClean picks out the sender and unsubscribe link and discards the rest. Message text and attachments are never downloaded.</>,
    },
    {
      title: "Where your data lives",
      body: <>Everything stays on this computer. There is no MailClean server or account, no analytics and no tracking — the app only talks directly to your email provider. Passwords are encrypted with AES-256-GCM.</>,
      extra: dataDir ? <p className="mt-3 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all text-subtle">{dataDir}</p> : null,
    },
    {
      title: "What it changes",
      body: <>Only what you click. <b className="text-ink">Move to Trash</b> moves mail to your provider&apos;s Trash (restorable for about 30 days), <b className="text-ink">Archive</b> removes it from the inbox, and <b className="text-ink">Unsubscribe</b> uses the sender&apos;s own unsubscribe link. Nothing is ever permanently deleted.</>,
    },
    {
      title: "Removing your data",
      body: <><b className="text-ink">Accounts → Disconnect</b> deletes that account&apos;s password and scanned data from this computer. To revoke access completely, also delete the app password at your provider.</>,
    },
  ];
  return (
    <div className="max-w-3xl space-y-3 text-sm leading-relaxed">
      <PageTitle title="Privacy" sub="Your email never leaves your computer." />
      {sections.map((s) => (
        <section key={s.title} className={card}>
          <h2 className="mb-1.5 font-semibold">{s.title}</h2>
          <p className="text-subtle">{s.body}</p>
          {s.extra}
        </section>
      ))}
      <p className="pt-2 text-xs text-subtle">
        MailClean is open source — anyone can check exactly what it does on <a href={REPO} {...ext} className="underline hover:text-ink">GitHub</a>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Security

export function SecurityPage({ onLockChange, toast, onOpenApps }: {
  onLockChange: () => void; toast: (m: string, k?: "ok" | "err") => void; onOpenApps: () => void;
}) {
  return (
    <div className="max-w-3xl space-y-3 text-sm leading-relaxed">
      <PageTitle title="Security" sub="Keep MailClean and your email accounts safe." />
      <AppLockSettings onChange={onLockChange} toast={toast} />
      <section className={card}>
        <h2 className="mb-1.5 font-semibold">Your passwords</h2>
        <p className="text-subtle">
          App passwords are encrypted with AES-256-GCM and stored only on this computer. MailClean connects to your provider over
          TLS and never sees your normal account password. To cut off access completely, delete the app password at your provider.
        </p>
      </section>
      <section className={card}>
        <h2 className="mb-1.5 font-semibold">Apps with access to your accounts</h2>
        <p className="text-subtle">Review which other apps and services can sign in to or read your Google, Yahoo, Apple or Microsoft account.</p>
        <button onClick={onOpenApps} className="mt-3 h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted">Open Apps &amp; access</button>
      </section>
      <section className={card}>
        <h2 className="mb-1.5 font-semibold">Only this app can talk to MailClean</h2>
        <p className="text-subtle">
          MailClean runs a small server on your computer that only accepts requests from its own window, using a secret that changes
          every time it starts — websites you visit can&apos;t read your data through it.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- About

export function AboutPage({ version, updates }: {
  version: string;
  updates: { info: UpdateInfo | null; checking: boolean; check: (force?: boolean) => void };
}) {
  return (
    <div className="max-w-3xl space-y-4 text-sm">
      <PageTitle title="About" sub="The app, updates, and who made it." />

      <section className={`${card} flex flex-wrap items-center gap-4`}>
        <img src="/brand/mailclean-icon.png" alt="" width={56} height={56} className="size-14" />
        <div className="min-w-48 flex-1">
          <div className="text-lg font-semibold">MailClean</div>
          <div className="text-subtle">Clean up every inbox in one place.</div>
          <div className="mt-1 text-xs text-subtle">Version {version || "—"} · Free and open source (MIT license)</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={SITE} {...ext} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-muted">Website <IconExternal /></a>
          <a href={REPO} {...ext} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-muted"><IconGitHub /> Source code</a>
        </div>
      </section>

      <UpdateSection {...updates} version={version} />

      <section className={card}>
        <h2 className="mb-4 font-semibold">Developer</h2>
        <div className="flex flex-wrap items-center gap-4">
          <img src="https://github.com/ravimehra9911.png?size=128" alt="Ravi Mehra" width={56} height={56}
            className="size-14 rounded-full border border-line bg-muted" />
          <div className="min-w-48 flex-1">
            <div className="text-base font-semibold">Ravi Mehra</div>
            <div className="text-subtle">“I built MailClean to clean up my own inbox, then made it open source for everyone.”</div>
          </div>
          <a href="https://github.com/ravimehra9911" {...ext}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5 font-medium text-bg hover:opacity-90">
            <IconGitHub /> @ravimehra9911
          </a>
        </div>
        <p className="mt-4 text-subtle">
          Enjoying MailClean? A <a href={REPO} {...ext} className="font-medium text-accent hover:underline">⭐ star on GitHub</a> helps others find it.
        </p>
      </section>
    </div>
  );
}
