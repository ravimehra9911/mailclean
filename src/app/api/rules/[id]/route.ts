import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, demoCookie, isDemo, readDemoState, type DemoState } from "@/lib/demo";
import { deleteRule, setRuleEnabled } from "@/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

/** In the demo, rules live in the visitor's cookie. */
function demoUpdate(req: NextRequest, change: (s: DemoState) => DemoState) {
  const ck = demoCookie(change(readDemoState(req.cookies.get(DEMO_COOKIE)?.value)));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ck.name, ck.value, ck.options);
  return res;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { enabled } = (await req.json()) as { enabled?: unknown };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (isDemo()) return demoUpdate(req, (s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: enabled ? 1 : 0 } : r)) }));
  setRuleEnabled(id, enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (isDemo()) return demoUpdate(req, (s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));
  deleteRule(id);
  return NextResponse.json({ ok: true });
}
