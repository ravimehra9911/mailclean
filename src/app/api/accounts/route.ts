import { ensureDemo, isDemo } from "@/lib/demo";
import { NextResponse } from "next/server";
import { DATA_DIR, listAccounts } from "@/lib/db";
import { isConfigured, rescanForHeaderFix } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export function GET() {
  ensureDemo();
  rescanForHeaderFix();
  // Never send tokens to the browser.
  const accounts = listAccounts().map(({ access_token, refresh_token, expires_at, imap_host, imap_port, imap_user, ...a }) => a);
  return NextResponse.json({
    accounts,
    configured: { google: isConfigured("google"), microsoft: isConfigured("microsoft") },
    about: { version: process.env.MAILCLEAN_VERSION ?? "dev", dataDir: isDemo() ? "" : DATA_DIR, demo: isDemo() },
  });
}
