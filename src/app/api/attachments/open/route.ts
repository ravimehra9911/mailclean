import { NextResponse, type NextRequest } from "next/server";
import { openFolder } from "@/lib/attachments";
import { isDemo } from "@/lib/demo";

/** Opens a MailClean download folder in Finder / File Explorer. */
export async function POST(req: NextRequest) {
  if (isDemo()) return NextResponse.json({ error: "Not available in the demo" }, { status: 403 });
  const { folder } = (await req.json().catch(() => ({}))) as { folder?: unknown };
  try {
    if (typeof folder !== "string") throw new Error("Missing folder");
    openFolder(folder);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
