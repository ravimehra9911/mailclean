import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isDemo, readDemoState } from "@/lib/demo";
import { matching, runRules } from "@/lib/rules";

/** Runs the enabled rules now. The demo only reports how many emails they would move. */
export async function POST(req: NextRequest) {
  if (isDemo()) {
    const state = readDemoState(req.cookies.get(DEMO_COOKIE)?.value);
    const count = state.rules.filter((r) => r.enabled).reduce((a, r) => a + matching(r, state.trashed), 0);
    return NextResponse.json({ count, errors: [], demo: true });
  }
  return NextResponse.json(await runRules());
}
