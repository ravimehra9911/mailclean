import { NextResponse, type NextRequest } from "next/server";
import { providers, saveConnectedAccount, startSync } from "@/lib/accounts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const desktop = req.cookies.get("oauth_return")?.value === "desktop";
  const home = (q: string) => {
    const res = desktop ? returnToApp(new URLSearchParams(q)) : NextResponse.redirect(new URL(`/?${q}`, req.url));
    res.cookies.delete("oauth_return");
    return res;
  };
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

/** Page shown in the system browser after a sign-in started from the desktop app. */
function returnToApp(q: URLSearchParams) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const ok = q.get("connected");
  const body = ok
    ? `<h1>✓ Connected ${esc(ok)}</h1><p>You can close this tab and return to the MailClean app. Scanning has started.</p>`
    : `<h1>Could not connect</h1><p>${esc(q.get("error") ?? "Unknown error")}</p><p>Close this tab and try again in MailClean.</p>`;
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MailClean</title>
<style>body{font:16px system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#16181d;background:#f6f7f9}
@media(prefers-color-scheme:dark){body{color:#e9ebef;background:#0e1013}}h1{font-size:22px}p{opacity:.8}</style>${body}`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
