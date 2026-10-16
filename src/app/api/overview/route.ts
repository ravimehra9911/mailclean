import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, ensureDemo, isDemo, readDemoState } from "@/lib/demo";
import { overview, scopeFromParams } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  ensureDemo();
  const scope = scopeFromParams(req.nextUrl.searchParams);
  if (isDemo()) scope.exclude = readDemoState(req.cookies.get(DEMO_COOKIE)?.value).trashed;
  return NextResponse.json(overview(scope));
}
