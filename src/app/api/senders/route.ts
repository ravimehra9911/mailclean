import { ensureDemo } from "@/lib/demo";
import { NextResponse, type NextRequest } from "next/server";
import { scopeFromParams, senders, type SenderFilter, type SenderSort, type SortDir } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  ensureDemo();
  const p = req.nextUrl.searchParams;
  return NextResponse.json(senders({
    ...scopeFromParams(p),
    sort: (p.get("sort") as SenderSort) || "count",
    dir: (p.get("dir") as SortDir) || "desc",
    filter: (p.get("filter") as SenderFilter) || "all",
    q: p.get("q") || undefined,
    limit: Math.min(Number(p.get("limit")) || 25, 200),
    offset: Number(p.get("offset")) || 0,
  }));
}
