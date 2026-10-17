import { NextResponse, type NextRequest } from "next/server";
import { markUnsubscribed } from "@/lib/actions";
import { isDemo } from "@/lib/demo";

/** POST { sender, url } — the user opened this sender's unsubscribe page from bulk unsubscribe. */
export async function POST(req: NextRequest) {
  const { sender, url } = (await req.json().catch(() => ({}))) as { sender?: unknown; url?: unknown };
  if (typeof sender !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!isDemo()) markUnsubscribed(sender, typeof url === "string" && url.startsWith("mailto:") ? "mailto" : "link");
  return NextResponse.json({ ok: true });
}
