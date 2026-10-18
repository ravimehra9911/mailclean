import { NextResponse, type NextRequest } from "next/server";
import { cleanQuery, cleanSenders, type CleanAction } from "@/lib/actions";
import { db, isGmailCategory } from "@/lib/db";
import { DEMO_COOKIE, demoCookie, ensureDemo, isDemo, readDemoState } from "@/lib/demo";

export async function POST(req: NextRequest) {
  const { senders, action, accountId, from, to, category, keepFlagged } = (await req.json()) as {
    senders: string[]; action: CleanAction; accountId?: string; from?: number; to?: number; category?: string; keepFlagged?: boolean;
  };
  if (!Array.isArray(senders) || !senders.every((s) => typeof s === "string") || !["trash", "archive"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const scope = { accountId: accountId || undefined, from: n(from), to: n(to), category: isGmailCategory(category) ? category : undefined };
  const keep = keepFlagged === true;

  if (isDemo()) {
    // Demo: count what would be cleaned and remember it for this visitor only.
    ensureDemo();
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    const q = cleanQuery(senders, action, { ...scope, exclude: state.trashed }, keep, "COUNT(*) c");
    const { c } = db().prepare(q.sql).get(...q.args) as { c: number };
    const res = NextResponse.json({ count: c, errors: [] });
    if (action === "trash") {
      const ck = demoCookie({ ...state, trashed: [...new Set([...state.trashed, ...senders])] });
      res.cookies.set(ck.name, ck.value, ck.options);
    }
    return res;
  }
  return NextResponse.json(await cleanSenders(senders, action, scope, keep));
}
