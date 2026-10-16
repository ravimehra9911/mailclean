import { NextResponse, type NextRequest } from "next/server";
import { isDemo } from "@/lib/demo";
import { checkForUpdate } from "@/lib/updates";

export const dynamic = "force-dynamic";

/** GET /api/update — is a newer MailClean release available? Add ?force=1 to skip the one-hour cache. */
export async function GET(req: NextRequest) {
  // The web demo isn't installed anywhere, so there is nothing to update.
  if (isDemo()) return NextResponse.json({ available: false, demo: true });
  return NextResponse.json(await checkForUpdate(req.nextUrl.searchParams.get("force") === "1"));
}
