import { NextResponse } from "next/server";
import { saveImapAccount, startSync } from "@/lib/accounts";
import { IMAP_HOSTS, verifyLogin, type ImapProvider } from "@/lib/providers/imap";

export async function POST(req: Request) {
  const { provider, email, password } = (await req.json()) as { provider: string; email: string; password: string };
  if (!(provider in IMAP_HOSTS) || typeof email !== "string" || typeof password !== "string" || !email.includes("@") || !password) {
    return NextResponse.json({ error: "Enter your email and app password" }, { status: 400 });
  }
  const p = provider as ImapProvider;
  const address = email.trim().toLowerCase();
  // App passwords are shown with spaces for readability; IMAP wants them without.
  const pass = password.replace(/\s+/g, "");
  try {
    await verifyLogin(p, address, pass);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 401 });
  }
  const id = saveImapAccount(p, address, pass);
  startSync(id);
  return NextResponse.json({ id, email: address });
}
