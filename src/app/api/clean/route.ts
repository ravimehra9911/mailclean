import { NextResponse } from "next/server";
import { cleanSenders, type CleanAction } from "@/lib/actions";

export async function POST(req: Request) {
  const { senders, action, accountId } = (await req.json()) as { senders: string[]; action: CleanAction; accountId?: string };
  if (!Array.isArray(senders) || !["trash", "archive"].includes(action)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  return NextResponse.json(await cleanSenders(senders, action, accountId || undefined));
}
