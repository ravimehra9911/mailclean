import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, demoCookie, ensureDemo, isDemo, readDemoState } from "@/lib/demo";
import { addRule, listRules, matching, parseRule } from "@/lib/rules";

export const dynamic = "force-dynamic";

/** Rules with how many emails each matches now. The demo keeps each visitor's rules in their cookie. */
function list(req: NextRequest) {
  if (!isDemo()) return listRules();
  const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
  return state.rules.map((r) => ({ ...r, last_run_at: null, cleaned: 0, matching: matching(r, state.trashed) }));
}

export function GET(req: NextRequest) {
  ensureDemo();
  return NextResponse.json({ rules: list(req) });
}

export async function POST(req: NextRequest) {
  ensureDemo();
  const rule = parseRule(await req.json());
  if (!rule) return NextResponse.json({ error: "Choose a sender or a Gmail tab, an action and an age" }, { status: 400 });
  if (isDemo()) {
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    if (state.rules.length >= 20) return NextResponse.json({ error: "The demo keeps up to 20 rules" }, { status: 400 });
    const rules = [...state.rules, { ...rule, id: crypto.randomUUID(), enabled: 1, created_at: Date.now() }];
    const ck = demoCookie({ ...state, rules });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ck.name, ck.value, ck.options);
    return res;
  }
  addRule(rule);
  return NextResponse.json({ ok: true });
}
