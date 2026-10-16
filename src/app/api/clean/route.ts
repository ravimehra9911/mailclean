import { NextResponse } from "next/server";
import { cleanSenders, type CleanAction } from "@/lib/actions";

export async function POST(req: Request) {
  const { senders, action, accountId, from, to } = (await req.json()) as {
    senders: string[]; action: CleanAction; accountId?: string; from?: number; to?: number;
  };
  if (!Array.isArray(senders) || !["trash", "archive"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return NextResponse.json(await cleanSenders(senders, action, { accountId: accountId || undefined, from: n(from), to: n(to) }));
}
