import { NextResponse } from "next/server";
import { clearDemo, loadDemo } from "@/lib/demo";

export function POST() {
  loadDemo();
  return NextResponse.json({ ok: true });
}

export function DELETE() {
  clearDemo();
  return NextResponse.json({ ok: true });
}
