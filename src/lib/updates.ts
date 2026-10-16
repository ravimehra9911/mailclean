// Update check against the latest GitHub release. The desktop app's server runs on the user's machine,
// so process.platform/arch here are the user's and pick the matching installer.

const REPO = "ravimehra9911/mailclean";

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  /** Installer for this computer, from the latest release. */
  downloadUrl: string | null;
  releaseUrl: string;
  notes: string | null;
  checkedAt: number;
  error?: string;
}

/** Installer file name for this platform; matches artifactName in package.json's build config. */
function installerName(): string | null {
  if (process.platform === "darwin") return process.arch === "arm64" ? "MailClean-mac-arm64.dmg" : "MailClean-mac-x64.dmg";
  if (process.platform === "win32") return "MailClean-windows-x64.exe";
  if (process.platform === "linux") return "MailClean-linux-x86_64.AppImage";
  return null;
}

/** Compares "1.2.3" style versions (a leading "v" is ignored). */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

const g = globalThis as { __mailcleanUpdate?: UpdateInfo };
const CACHE_MS = 60 * 60_000; // GitHub allows 60 unauthenticated requests per hour per IP

export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  const current = process.env.MAILCLEAN_VERSION ?? "0.0.0";
  if (!force && g.__mailcleanUpdate && Date.now() - g.__mailcleanUpdate.checkedAt < CACHE_MS) return g.__mailcleanUpdate;

  const releaseUrl = `https://github.com/${REPO}/releases/latest`;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `MailClean/${current}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const rel = (await res.json()) as { tag_name: string; html_url: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
    const latest = rel.tag_name.replace(/^v/, "");
    const file = installerName();
    const asset = rel.assets?.find((a) => a.name === file);
    g.__mailcleanUpdate = {
      current,
      latest,
      available: isNewer(latest, current),
      downloadUrl: asset?.browser_download_url ?? null,
      releaseUrl: rel.html_url || releaseUrl,
      notes: rel.body?.slice(0, 2000) ?? null,
      checkedAt: Date.now(),
    };
  } catch (e) {
    // Keep the last good result if there is one; otherwise report the error.
    if (g.__mailcleanUpdate && !force) return g.__mailcleanUpdate;
    return {
      current, latest: null, available: false, downloadUrl: null, releaseUrl, notes: null, checkedAt: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
  return g.__mailcleanUpdate;
}
