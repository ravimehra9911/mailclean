import { ensureDemo } from "@/lib/demo";
import { NextResponse, type NextRequest } from "next/server";
import { overview, scopeFromParams } from "@/lib/stats";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  ensureDemo();
  return NextResponse.json(overview(scopeFromParams(req.nextUrl.searchParams)));
}
