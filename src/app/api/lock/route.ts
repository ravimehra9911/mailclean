import { NextResponse, type NextRequest } from "next/server";
import { checkPin, isValidPin, lockStatus, removePin, setPin, UNLOCK_COOKIE } from "@/lib/applock";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

// App lock. This route stays reachable while the app is locked (see src/middleware.ts); every action that
// changes the PIN asks for the current one, and "reset" wipes all MailClean data.

const withCookie = (body: object, token: string | null) => {
  const res = NextResponse.json(body);
  if (token) res.cookies.set(UNLOCK_COOKIE, token, { httpOnly: true, sameSite: "strict", path: "/" });
  else res.cookies.delete(UNLOCK_COOKIE);
  return res;
};
const fail = (error: string, extra: object = {}, status = 400) => NextResponse.json({ error, ...extra }, { status });

export function GET(req: NextRequest) {
  if (isDemo()) return NextResponse.json({ enabled: false, unlocked: true, waitMs: 0, demo: true });
  return NextResponse.json(lockStatus(req.cookies.get(UNLOCK_COOKIE)?.value));
}

export async function POST(req: NextRequest) {
  if (isDemo()) return fail("The app lock isn't available in the web demo.");
  const body = (await req.json().catch(() => ({}))) as { action?: string; pin?: unknown; current?: unknown; confirm?: unknown };
  const status = lockStatus(req.cookies.get(UNLOCK_COOKIE)?.value);
  const verify = (pin: unknown) => {
    if (!isValidPin(pin)) return fail("Enter your 6-digit PIN");
    const r = checkPin(pin);
    if (r.ok) return r.token;
    return r.waitMs
      ? fail(`Too many wrong tries. Try again in ${Math.ceil(r.waitMs / 1000)} seconds.`, { waitMs: r.waitMs }, 429)
      : fail(`Wrong PIN. ${r.left} ${r.left === 1 ? "try" : "tries"} left before you have to wait.`, { left: r.left }, 401);
  };

  switch (body.action) {
    case "setup":
      if (status.enabled) return fail("A PIN is already set. Change it instead.");
      if (!isValidPin(body.pin)) return fail("The PIN must be exactly 6 digits.");
      return withCookie({ ok: true }, setPin(body.pin));
    case "unlock": {
      const r = verify(body.pin);
      return typeof r === "string" ? withCookie({ ok: true }, r) : r;
    }
    case "change": {
      const r = verify(body.current);
      if (typeof r !== "string") return r;
      if (!isValidPin(body.pin)) return fail("The new PIN must be exactly 6 digits.");
      return withCookie({ ok: true }, setPin(body.pin));
    }
    case "disable": {
      const r = verify(body.current);
      if (typeof r !== "string") return r;
      removePin();
      return withCookie({ ok: true }, null);
    }
    case "lock":
      return withCookie({ ok: true }, null);
    case "reset": {
      // Forgot PIN: start fresh. Removes every connected account, scanned email, rule and setting, and the PIN.
      // Nothing in the mailboxes themselves is changed.
      if (body.confirm !== "RESET") return fail("Type RESET to confirm.");
      db().exec("DELETE FROM messages; DELETE FROM accounts; DELETE FROM rules; DELETE FROM unsubscribed; DELETE FROM kv;");
      removePin();
      return withCookie({ ok: true }, null);
    }
    default:
      return fail("Unknown action");
  }
}
