import { NextResponse, type NextRequest } from "next/server";
import { unsubscribePlan } from "@/lib/actions";
import { DEMO_COOKIE, ensureDemo, isDemo, readDemoState } from "@/lib/demo";

/** POST { senders } → how each sender can be unsubscribed (for the confirmation window). */
export async function POST(req: NextRequest) {
  const { senders } = (await req.json().catch(() => ({}))) as { senders?: unknown };
  if (!Array.isArray(senders) || !senders.every((s) => typeof s === "string") || senders.length > 500) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  ensureDemo();
  const extra = isDemo() ? readDemoState(req.cookies.get(DEMO_COOKIE)?.value).unsubscribed : [];
  return NextResponse.json({ plan: unsubscribePlan(senders as string[], extra) });
}
