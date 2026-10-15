import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, providers } from "@/lib/accounts";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(`${provider} is not configured — see README`)}`, _req.url));
  }
  // CSRF protection: the state must come back unchanged and match this cookie.
  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(providers[provider].authUrl(state));
  res.cookies.set(`oauth_state_${provider}`, state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
