import { DEMO_MESSAGE, isDemo } from "@/lib/demo";
import { NextResponse } from "next/server";
import { saveImapAccount, startSync } from "@/lib/accounts";
import { IMAP_PROVIDERS, isImapProvider } from "@/lib/catalog";
import { verifyLogin } from "@/lib/providers/imap";

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export async function POST(req: Request) {
  if (isDemo()) return NextResponse.json({ error: DEMO_MESSAGE }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string; email?: string; password?: string; host?: string; port?: number | string; username?: string;
  };
  const { provider, email, password } = body;
  if (!provider || !isImapProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email.trim()) || typeof password !== "string" || !password.trim()) {
    return NextResponse.json({ error: "Enter your email address and app password" }, { status: 400 });
  }
  const info = IMAP_PROVIDERS[provider];
  const host = (typeof body.host === "string" && body.host.trim() ? body.host.trim() : info.host ?? "").toLowerCase();
  const port = Number(body.port) || info.port;
  if (!HOSTNAME.test(host)) return NextResponse.json({ error: "Enter a valid IMAP server name, e.g. imap.example.com" }, { status: 400 });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return NextResponse.json({ error: "Enter a valid port (usually 993)" }, { status: 400 });

  const address = email.trim().toLowerCase();
  const user = typeof body.username === "string" && body.username.trim() ? body.username.trim() : address;
  // App passwords are often shown in groups ("abcd efgh ijkl mnop"); providers expect them without spaces.
  const pass = info.id === "imap" ? password : password.replace(/\s+/g, "");
  try {
    await verifyLogin({ host, port, user, pass, label: info.label });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 401 });
  }
  const id = saveImapAccount(provider, address, pass, { host, port, user });
  startSync(id);
  return NextResponse.json({ id, email: address });
}
