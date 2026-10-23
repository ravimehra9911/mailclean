import { NextResponse } from "next/server";
import { clearDownloads, downloadsRoot, listDownloads, type Job } from "@/lib/attachments";
import { DEMO_MESSAGE, isDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** Sample history for the web demo. */
function demoHistory(): Job[] {
  const now = Date.now();
  const job = (id: string, title: string, formats: string, total: number, saved: number, existing: number, mb: number, ago: number): Job => ({
    id, title, formats, folder: `~/Downloads/MailClean/${title}`, total, saved, existing, failed: 0, bytes: Math.round(mb * 1024 * 1024),
    status: "done", errors: [], startedAt: now - ago, finishedAt: now - ago + 90_000, cancelling: false,
  });
  return [
    job("demo-1", "ShopKart Deals", "pdf", 279, 279, 0, 51.2, 2 * 3600_000),
    job("demo-2", "CodeHost", "pdf,png", 42, 30, 12, 6.4, 3 * DAY),
  ];
}

/** Download history (newest first) and the folder files are saved in. */
export function GET() {
  if (isDemo()) return NextResponse.json({ root: "~/Downloads/MailClean", downloads: demoHistory() });
  return NextResponse.json({ root: downloadsRoot(), downloads: listDownloads() });
}

/** Clears finished downloads from the history; the saved files stay on disk. */
export function DELETE() {
  if (isDemo()) return NextResponse.json({ error: DEMO_MESSAGE }, { status: 403 });
  clearDownloads();
  return NextResponse.json({ ok: true });
}
