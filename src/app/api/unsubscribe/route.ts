import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/actions";

export async function POST(req: Request) {
  const { sender } = (await req.json()) as { sender: string };
  if (typeof sender !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json(await unsubscribe(sender));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
