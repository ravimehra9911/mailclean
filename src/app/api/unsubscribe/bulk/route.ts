import { NextResponse, type NextRequest } from "next/server";
import { bulkUnsubscribe, unsubscribePlan } from "@/lib/actions";
import { DEMO_COOKIE, demoCookie, ensureDemo, isDemo, readDemoState } from "@/lib/demo";

/** POST { senders } → runs one-click unsubscribes in the background; returns the result per sender. */
export async function POST(req: NextRequest) {
  const { senders } = (await req.json().catch(() => ({}))) as { senders?: unknown };
  if (!Array.isArray(senders) || !senders.every((s) => typeof s === "string") || senders.length > 500) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (isDemo()) {
    // Demo: pretend the one-click unsubscribes worked, for this visitor only.
    ensureDemo();
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    const done = unsubscribePlan(senders as string[], state.unsubscribed)
      .filter((p) => p.method === "one-click" && !p.already).map((p) => p.sender);
    const res = NextResponse.json({ results: done.map((sender) => ({ sender, status: "done" })), links: [] });
    const ck = demoCookie({ ...state, unsubscribed: [...new Set([...state.unsubscribed, ...done])] });
    res.cookies.set(ck.name, ck.value, ck.options);
    return res;
  }
  return NextResponse.json(await bulkUnsubscribe(senders as string[]));
}
