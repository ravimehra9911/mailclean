import { NextResponse, type NextRequest } from "next/server";
import { overview } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return NextResponse.json(overview(p.get("account") || undefined, Number(p.get("days")) || 180));
}
