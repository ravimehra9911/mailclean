import { NextResponse } from "next/server";
import { getAccount } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { removeAccount } from "@/lib/accounts";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAccount(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Revoke Google access too, so the app disappears from the user's Google connections.
  if (a.provider === "google" && a.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(a.refresh_token))}`, { method: "POST" })
      .catch(() => {});
  }
  removeAccount(id);
  return NextResponse.json({ ok: true });
}
