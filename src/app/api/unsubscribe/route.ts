import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/actions";
import { DEMO_COOKIE, demoCookie, isDemo, readDemoState } from "@/lib/demo";

export async function POST(req: NextRequest) {
  const { sender } = (await req.json()) as { sender: string };
  if (typeof sender !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (isDemo()) {
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    const res = NextResponse.json({ status: "done" });
    const ck = demoCookie({ ...state, unsubscribed: [...new Set([...state.unsubscribed, sender])] });
    res.cookies.set(ck.name, ck.value, ck.options);
    return res;
  }
  try {
    return NextResponse.json(await unsubscribe(sender));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
