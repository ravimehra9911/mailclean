import { NextResponse, type NextRequest } from "next/server";
import { cancelDownload, getJob, startDownload } from "@/lib/attachments";
import { DEMO_MESSAGE, isDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** Starts saving the chosen formats from a scan. */
export async function POST(req: NextRequest) {
  if (isDemo()) return NextResponse.json({ error: DEMO_MESSAGE }, { status: 403 });
  const { scanId, formats } = (await req.json().catch(() => ({}))) as { scanId?: unknown; formats?: unknown };
  const exts = Array.isArray(formats) ? formats.filter((f): f is string => typeof f === "string") : [];
  if (typeof scanId !== "string" || !exts.length) return NextResponse.json({ error: "Choose at least one format" }, { status: 400 });
  const job = startDownload(scanId, exts);
  if (!job) return NextResponse.json({ error: "This scan has expired — scan again" }, { status: 410 });
  return NextResponse.json(job);
}

/** Progress of a download job. */
export function GET(req: NextRequest) {
  const job = getJob(req.nextUrl.searchParams.get("job") ?? "");
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Unknown download" }, { status: 404 });
}

/** Cancels a running download; files already saved are kept. */
export function DELETE(req: NextRequest) {
  if (isDemo()) return NextResponse.json({ error: DEMO_MESSAGE }, { status: 403 });
  return cancelDownload(req.nextUrl.searchParams.get("job") ?? "")
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "This download isn't running" }, { status: 409 });
}
