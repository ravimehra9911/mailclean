// Installers and platform icons shared by the landing page and /download.

const REPO = "https://github.com/ravimehra9911/mailclean";
/** Always the newest release's file (installer names never change between versions). */
export const dl = (file: string) => `${REPO}/releases/latest/download/${file}`;

export const DOWNLOADS = [
  { os: "macOS", detail: "Apple Silicon (M1–M4)", file: "MailClean-mac-arm64.dmg", id: "mac-arm64", key: "mac", arch: "arm", Icon: AppleIcon },
  { os: "macOS", detail: "Intel", file: "MailClean-mac-x64.dmg", id: "mac-x64", key: "mac", arch: "x86", Icon: AppleIcon },
  { os: "Windows", detail: "Windows 10/11, 64-bit", file: "MailClean-windows-x64.exe", id: "windows", key: "windows", Icon: WindowsIcon },
  { os: "Linux", detail: "AppImage, x86-64", file: "MailClean-linux-x86_64.AppImage", id: "linux", key: "linux", Icon: LinuxIcon },
] as const;

/** Install and first-launch steps per platform, shown from the "How to install" pill on each download card. */
export const INSTALL: Record<"mac" | "windows" | "linux", { steps: readonly string[]; req: string }> = {
  mac: {
    steps: [
      "Open the downloaded .dmg and drag MailClean into Applications.",
      "Open MailClean from Applications. macOS says it can't check the app, because builds aren't notarised by Apple yet.",
      "Open System Settings → Privacy & Security, scroll down and click Open Anyway next to MailClean. You only do this once.",
    ],
    req: "macOS 12 Monterey or later · Apple Silicon (M1–M4) or Intel",
  },
  windows: {
    steps: [
      "Run MailClean-windows-x64.exe and follow the installer.",
      "If Windows SmartScreen appears, click More info → Run anyway. Builds aren't code-signed yet, so Windows doesn't recognise the publisher.",
      "Start MailClean from the Start menu or the desktop shortcut.",
    ],
    req: "Windows 10 or 11, 64-bit",
  },
  linux: {
    steps: [
      "Make the AppImage executable: right-click → Properties → Allow executing as a program, or run chmod +x MailClean-linux-x86_64.AppImage.",
      "Double-click it (or run ./MailClean-linux-x86_64.AppImage) to start MailClean. No installation needed.",
      "Optional: use AppImageLauncher to add it to your applications menu.",
    ],
    req: "64-bit (x86-64) Linux, e.g. Ubuntu 22.04+, Fedora 38+, Debian 12+",
  },
};

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.49ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.56-1.23Z" />
    </svg>
  );
}

export function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 5.1 10.4 4v7.1H3V5.1Zm0 13.8 7.4 1.1v-7.1H3v6Zm8.2 1.2L21 21.5v-8.6h-9.8v7.2Zm0-16.2v7.2H21V2.5l-9.8 1.4Z" />
    </svg>
  );
}

export function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2c-2.2 0-3.6 1.9-3.6 4.6 0 1.4.2 2.3-.6 3.6-.9 1.4-2.6 3.5-2.6 6 0 .7.1 1.3.4 1.8-.6.3-1.6.6-1.6 1.4 0 1 1.6 1.2 3 1.7 1 .3 1.8.9 2.7.9.8 0 1.4-.4 1.8-.9h2.9c.4.5 1 .9 1.8.9.9 0 1.7-.6 2.7-.9 1.4-.5 3-.7 3-1.7 0-.8-1-1.1-1.6-1.4.3-.5.4-1.1.4-1.8 0-2.5-1.7-4.6-2.6-6-.8-1.3-.6-2.2-.6-3.6C15.6 3.9 14.2 2 12 2Zm-1.5 4.2c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1Zm3 0c.4 0 .7.5.7 1.1s-.3 1.1-.7 1.1-.7-.5-.7-1.1.3-1.1.7-1.1ZM12 9.2c.8 0 2 .6 2 1s-1.2 1.2-2 1.2-2-.8-2-1.2 1.2-1 2-1Z" />
    </svg>
  );
}
