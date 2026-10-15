import { NextResponse, type NextRequest } from "next/server";
import { providers, saveConnectedAccount, startSync } from "@/lib/accounts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const home = (q: string) => NextResponse.redirect(new URL(`/?${q}`, req.url));
  if (provider !== "google" && provider !== "microsoft") return home("error=Unknown+provider");

  const url = req.nextUrl;
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return home(`error=${encodeURIComponent(err)}`);

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || state !== req.cookies.get(`oauth_state_${provider}`)?.value) {
    return home("error=Sign-in+check+failed%2C+please+try+again");
  }
  try {
    const t = await providers[provider].exchangeCode(code);
    const id = saveConnectedAccount(provider, t);
    startSync(id);
    const res = home(`connected=${encodeURIComponent(t.email)}`);
    res.cookies.delete(`oauth_state_${provider}`);
    return res;
  } catch (e) {
    console.error("[connect]", e);
    return home(`error=${encodeURIComponent("Could not connect: " + (e instanceof Error ? e.message : String(e)))}`);
  }
}
