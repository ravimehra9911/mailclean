import { NextResponse, type NextRequest } from "next/server";
import { senders, type SenderFilter, type SenderSort } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return NextResponse.json(senders({
    accountId: p.get("account") || undefined,
    sort: (p.get("sort") as SenderSort) || "count",
    filter: (p.get("filter") as SenderFilter) || "all",
    q: p.get("q") || undefined,
    limit: Math.min(Number(p.get("limit")) || 25, 200),
    offset: Number(p.get("offset")) || 0,
  }));
}
