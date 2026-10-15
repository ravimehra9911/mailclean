import { NextResponse } from "next/server";
import { listAccounts } from "@/lib/db";
import { isConfigured } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export function GET() {
  // Never send tokens to the browser.
  const accounts = listAccounts().map(({ access_token, refresh_token, expires_at, ...a }) => a);
  return NextResponse.json({
    accounts,
    configured: { google: isConfigured("google"), microsoft: isConfigured("microsoft") },
  });
}
