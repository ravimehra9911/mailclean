"use client";

// Guided tours (driver.js): a getting-started tour shown on first launch, and an
// "add an account" tour. Both can be replayed from the sidebar or the About page.

import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { Tab } from "./Sidebar";

export type TourKind = "intro" | "add-account";
/** Set once a tour has been shown, so it only starts automatically on first launch. */
export const TOUR_DONE_KEY = "mailclean-tour-done";

export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_DONE_KEY) === "1"; } catch { return true; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until a [data-tour] target is on the page (after a tab switch), up to 3 seconds. */
async function waitFor(name: string) {
  for (let i = 0; i < 30; i++) {
    if (document.querySelector(`[data-tour="${name}"]`)) return;
    await sleep(100);
  }
}

const el = (name: string) => `[data-tour="${name}"]`;

function addAccountSteps(d: () => Driver): DriveStep[] {
  return [
    {
      element: el("providers"),
      popover: {
        title: "1. Pick your email provider",
        description: "Gmail, Yahoo, iCloud, AOL, Zoho or any other mailbox (IMAP). Let's open Gmail as an example.",
        side: "bottom",
        onNextClick: async () => {
          if (!document.querySelector(el("steps"))) {
            (document.querySelector(el("provider-gmail")) as HTMLElement | null)?.click();
            await waitFor("steps");
          }
          d().moveNext();
        },
      },
    },
    {
      element: el("steps"),
      popover: {
        title: "2. Create an app password",
        description: "MailClean connects with an <b>app password</b> — a separate 16-letter password just for this app. These steps show how to make one for your provider.",
        side: "top",
      },
    },
    {
      element: el("app-password-link"),
      popover: {
        title: "3. Open your provider's page",
        description: "This opens the right page in your browser. Name the password “MailClean” and copy it.",
        side: "bottom",
      },
    },
    {
      element: el("email"),
      popover: { title: "4. Your email address", description: "Enter the address of the mailbox you want to clean.", side: "top" },
    },
    {
      element: el("password"),
      popover: {
        title: "5. Paste the app password",
        description: "Paste the 16-letter app password here — <b>not</b> your normal email password.",
        side: "top",
      },
    },
    {
      element: el("connect"),
      popover: {
        title: "6. Connect",
        description: "MailClean checks the login and starts scanning. Your password is encrypted and never leaves this computer. 🔒",
        side: "top",
      },
    },
  ];
}

function introSteps(d: () => Driver, setTab: (t: Tab) => void): DriveStep[] {
  return [
    {
      popover: {
        title: "Welcome to MailClean 👋",
        description: "A quick tour of how to find out who fills your inbox and clean it up. It takes about a minute.",
      },
    },
    { element: el("nav"), popover: { title: "Sections", description: "Overview, every sender, just newsletters, and your connected accounts.", side: "right" } },
    { element: el("date-filter"), popover: { title: "Filter by date", description: "Look at all time, the last 30 days, a whole year, or pick your own start and end dates.", side: "bottom" } },
    { element: el("account-filter"), popover: { title: "Choose an inbox", description: "See all your accounts together, or one at a time.", side: "bottom" } },
    { element: el("sync"), popover: { title: "Sync", description: "Deleted or received emails in Gmail or Yahoo directly? Click <b>Sync</b> to rescan so the numbers stay up to date.", side: "bottom" } },
    { element: el("summary"), popover: { title: "Your inbox at a glance", description: "How much space you can free up, your totals, and how mail splits across your accounts.", side: "bottom" } },
    { element: el("cleanup"), popover: { title: "Clean up next", description: "The quickest wins: senders you never open, mail older than a year, newsletters. Click <b>Review</b> to see those senders.", side: "top" } },
    {
      element: el("senders-table"),
      popover: { title: "Who fills your inbox", description: "Every sender ranked by emails, size and unread. Labels show which inbox each sender's emails are in.", side: "top" },
    },
    { element: el("sort-headers"), popover: { title: "Sort any column", description: "Click a column name to sort; click again to flip ▲▼.", side: "bottom" } },
    {
      element: el("row-actions"),
      popover: {
        title: "Clean up a sender",
        description: "<b>Unsubscribe</b> stops new emails. <b>Trash all</b> moves every email from this sender to Trash — you can restore them for about 30 days.",
        side: "left",
      },
    },
    {
      element: el("select"),
      popover: {
        title: "Clean many at once",
        description: "Tick several senders and a bar appears to <b>Move to Trash</b> or <b>Archive</b> all of them in one click.",
        side: "right",
        onNextClick: async () => {
          setTab("accounts");
          await waitFor("add-account");
          d().moveNext();
        },
      },
    },
    {
      element: el("add-account"),
      popover: {
        title: "Add more inboxes",
        description: "Connect Gmail, Yahoo, iCloud and more here. <b>Help → How to add an account</b> walks you through it step by step.",
        side: "bottom",
        onPrevClick: async () => {
          setTab("overview");
          await waitFor("select");
          d().movePrevious();
        },
      },
    },
    { element: el("theme"), popover: { title: "Light or dark", description: "Follow your system, or choose light or dark.", side: "right" } },
    {
      element: el("help"),
      popover: { title: "Need help?", description: "Replay this tour, follow the add-account guide, or find quick answers under <b>Help</b>.", side: "right" },
    },
  ];
}

/** Starts a tour. The intro adapts: without accounts it goes straight to adding one. */
export async function startTour(kind: TourKind, ctx: { setTab: (t: Tab) => void; hasAccounts: boolean }) {
  let d: Driver | null = null;
  const get = () => d!;

  let steps: DriveStep[];
  if (kind === "add-account" || !ctx.hasAccounts) {
    if (ctx.hasAccounts) ctx.setTab("accounts");
    await waitFor("providers");
    steps = addAccountSteps(get);
    if (kind === "intro") {
      steps.unshift({
        popover: {
          title: "Welcome to MailClean 👋",
          description: "Let's connect your first inbox. It takes about two minutes, and everything stays on this computer.",
        },
      });
    }
  } else {
    ctx.setTab("overview");
    await waitFor("senders-table");
    // Sidebar items are hidden on small screens; skip those steps there. Other targets may appear
    // later (after a tab switch), so they always stay.
    const sidebarOnly = new Set([el("nav"), el("theme"), el("help")]);
    steps = introSteps(get, ctx.setTab).filter((s) => {
      if (!s.element || !sidebarOnly.has(s.element as string)) return true;
      const node = document.querySelector(s.element as string) as HTMLElement | null;
      return !!node && node.offsetParent !== null;
    });
  }

  d = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next →",
    prevBtnText: "← Back",
    doneBtnText: "Done",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: "mc-tour",
    onDestroyed: () => {
      try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch { /* not persisted */ }
    },
  });
  d.drive();
}
