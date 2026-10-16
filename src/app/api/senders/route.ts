import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, ensureDemo, isDemo, readDemoState } from "@/lib/demo";
import { scopeFromParams, senders, type SenderFilter, type SenderSort, type SortDir } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  ensureDemo();
  const p = req.nextUrl.searchParams;
  const demo = isDemo() ? readDemoState(req.cookies.get(DEMO_COOKIE)?.value) : null;
  const result = senders({
    ...scopeFromParams(p),
    exclude: demo?.trashed,
    sort: (p.get("sort") as SenderSort) || "count",
    dir: (p.get("dir") as SortDir) || "desc",
    filter: (p.get("filter") as SenderFilter) || "all",
    q: p.get("q") || undefined,
    limit: Math.min(Number(p.get("limit")) || 25, 200),
    offset: Number(p.get("offset")) || 0,
  });
  if (demo) for (const r of result.rows) if (demo.unsubscribed.includes(r.email)) r.unsubscribed = 1;
  return NextResponse.json(result);
}
