import { NextResponse } from "next/server";
import { startSync } from "@/lib/accounts";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ started: startSync(id) });
}
