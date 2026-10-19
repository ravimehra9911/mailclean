import { NextResponse, type NextRequest } from "next/server";
import { companies, filterCompanies, type CompanyFilter } from "@/lib/companies";
import { DEMO_COOKIE, ensureDemo, isDemo, readDemoState } from "@/lib/demo";

export const dynamic = "force-dynamic";

const FILTERS: CompanyFilter[] = ["all", "security", "quiet", "newsletters"];

/** "Who has your email": companies that have emailed you, with counts for each filter. */
export function GET(req: NextRequest) {
  ensureDemo();
  const p = req.nextUrl.searchParams;
  const filter = FILTERS.includes(p.get("filter") as CompanyFilter) ? (p.get("filter") as CompanyFilter) : "all";
  const limit = Math.min(Number(p.get("limit")) || 50, 500);
  const offset = Number(p.get("offset")) || 0;
  const list = companies({
    accountId: p.get("account") || undefined,
    unsubscribed: isDemo() ? readDemoState(req.cookies.get(DEMO_COOKIE)?.value).unsubscribed : undefined,
  });
  const counts = Object.fromEntries(FILTERS.map((f) => [f, filterCompanies(list, f).length]));
  const rows = filterCompanies(list, filter, p.get("q") || undefined);
  return NextResponse.json({ total: rows.length, counts, rows: rows.slice(offset, offset + limit) });
}
