import { NextResponse, type NextRequest } from "next/server";
import { cleanSenders, type CleanAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { DEMO_COOKIE, demoCookie, ensureDemo, isDemo, readDemoState } from "@/lib/demo";
import { scopeSql } from "@/lib/stats";

export async function POST(req: NextRequest) {
  const { senders, action, accountId, from, to } = (await req.json()) as {
    senders: string[]; action: CleanAction; accountId?: string; from?: number; to?: number;
  };
  if (!Array.isArray(senders) || !senders.every((s) => typeof s === "string") || !["trash", "archive"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const scope = { accountId: accountId || undefined, from: n(from), to: n(to) };

  if (isDemo()) {
    // Demo: count what would be cleaned and remember it for this visitor only.
    ensureDemo();
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    const { conds, args } = scopeSql({ ...scope, exclude: state.trashed });
    const marks = senders.map(() => "?").join(",");
    const { c } = db().prepare(`SELECT COUNT(*) c FROM messages m WHERE m.from_email IN (${marks})
      ${action === "archive" ? "AND m.in_inbox = 1" : ""} ${conds.map((x) => `AND ${x}`).join(" ")}`)
      .get(...senders, ...args) as { c: number };
    const res = NextResponse.json({ count: c, errors: [] });
    if (action === "trash") {
      const ck = demoCookie({ ...state, trashed: [...new Set([...state.trashed, ...senders])] });
      res.cookies.set(ck.name, ck.value, ck.options);
    }
    return res;
  }
  return NextResponse.json(await cleanSenders(senders, action, scope));
}
