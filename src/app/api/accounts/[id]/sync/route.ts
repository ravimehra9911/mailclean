import { NextResponse } from "next/server";
import { startSync } from "@/lib/accounts";
import { DEMO_MESSAGE, isDemo } from "@/lib/demo";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemo()) return NextResponse.json({ error: DEMO_MESSAGE }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ started: startSync(id) });
}
