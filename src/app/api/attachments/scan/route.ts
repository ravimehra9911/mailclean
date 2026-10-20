import { NextResponse, type NextRequest } from "next/server";
import { formatLabel, scanAttachments } from "@/lib/attachments";
import { db, isGmailCategory } from "@/lib/db";
import { ensureDemo, isDemo } from "@/lib/demo";

/** Finds the attachments in the selected senders' emails and summarises them by format. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    senders?: unknown; accountId?: string; from?: number; to?: number; category?: string;
  };
  const senders = Array.isArray(body.senders) ? body.senders.filter((s): s is string => typeof s === "string").slice(0, 200) : [];
  if (!senders.length) return NextResponse.json({ error: "Select at least one sender" }, { status: 400 });
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const scope = { accountId: body.accountId || undefined, from: n(body.from), to: n(body.to), category: isGmailCategory(body.category) ? body.category : undefined };

  if (isDemo()) {
    // Sample data has no real emails: show what a scan looks like.
    ensureDemo();
    const { c } = db().prepare(`SELECT COUNT(*) c FROM messages WHERE from_email IN (${senders.map(() => "?").join(",")})`).get(...senders) as { c: number };
    const pdf = Math.round(c * 0.3), png = Math.round(c * 0.5), xlsx = Math.round(c * 0.02);
    const formats = [["pdf", pdf, 240_000], ["png", png, 18_000], ["xlsx", xlsx, 60_000]]
      .filter(([, k]) => (k as number) > 0)
      .map(([ext, k, avg]) => ({ ext, label: formatLabel(ext as string), count: k as number, bytes: (k as number) * (avg as number) }));
    return NextResponse.json({ scanId: null, demo: true, emails: c, files: pdf + png + xlsx, skipped: [], formats });
  }
  try {
    return NextResponse.json(await scanAttachments(senders, scope));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
