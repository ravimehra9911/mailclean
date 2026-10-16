// Download counts per installer, summed over all GitHub releases (GitHub counts every asset download).

const REPO = "ravimehra9911/mailclean";

export type InstallerKey = "mac-arm64" | "mac-x64" | "windows" | "linux";

export interface DownloadCounts {
  byInstaller: Record<InstallerKey, number>;
  total: number;
}

const EMPTY: DownloadCounts = { byInstaller: { "mac-arm64": 0, "mac-x64": 0, windows: 0, linux: 0 }, total: 0 };

/** Maps a release asset name to its installer, or null for other files (blockmaps, etc.). */
function installerOf(name: string): InstallerKey | null {
  if (/\.blockmap$/i.test(name)) return null;
  if (/\.dmg$/i.test(name)) return /arm64/i.test(name) ? "mac-arm64" : "mac-x64";
  if (/\.exe$/i.test(name)) return "windows";
  if (/\.AppImage$/i.test(name)) return "linux";
  return null;
}

export async function getDownloadCounts(): Promise<DownloadCounts> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "mailclean-website" },
      next: { revalidate: 3600 }, // refresh hourly (GitHub allows 60 unauthenticated requests/hour)
    });
    if (!res.ok) return EMPTY;
    const releases = (await res.json()) as { assets?: { name: string; download_count: number }[] }[];
    const byInstaller = { ...EMPTY.byInstaller };
    for (const r of releases) {
      for (const a of r.assets ?? []) {
        const k = installerOf(a.name);
        if (k) byInstaller[k] += a.download_count;
      }
    }
    return { byInstaller, total: Object.values(byInstaller).reduce((x, y) => x + y, 0) };
  } catch {
    return EMPTY;
  }
}
