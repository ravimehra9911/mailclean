import { NextResponse, type NextRequest } from "next/server";
import { lockStatus, UNLOCK_COOKIE } from "@/lib/applock";

// In the desktop app the server listens on localhost, where any website the user visits could send it
// requests. The app passes a random per-launch token (MAILCLEAN_TOKEN) and adds it to every request from
// its own window; everything else is refused. Without a token (npm run dev) these checks are skipped.

// Sign-in runs in the system browser, which cannot send the token. These routes only redirect to the
// provider or finish a sign-in protected by the OAuth state cookie, so they stay open.
const OPEN = /^\/api\/connect\/google(\/callback)?$/;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  // Hosted website + demo (Vercel): "/" shows the landing page; the demo dashboard is at "/demo".
  if (process.env.MAILCLEAN_DEMO === "1" || process.env.VERCEL === "1") {
    const { pathname } = req.nextUrl;
    // The site moved to its own domain; send visitors and search engines from the old Vercel address.
    if (req.headers.get("host") === "mailclean-gilt.vercel.app") {
      return NextResponse.redirect(new URL(`${pathname}${req.nextUrl.search}`, "https://www.mailclean.app"), 308);
    }
    if (pathname === "/") return NextResponse.rewrite(new URL("/site", req.url));
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const token = process.env.MAILCLEAN_TOKEN;
  if (token) {
    // Block DNS-rebinding: only accept requests addressed to this machine.
    const host = req.headers.get("host") ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return new NextResponse("Forbidden", { status: 403 });

    if (pathname.startsWith("/api/") && !OPEN.test(pathname)) {
      const sent = req.headers.get("x-mailclean-token") ?? "";
      if (!safeEqual(sent, token)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // App lock: with a PIN set, data is only served after unlocking (the lock route itself stays open).
  if (pathname.startsWith("/api/") && pathname !== "/api/lock" && !OPEN.test(pathname)) {
    const lock = lockStatus(req.cookies.get(UNLOCK_COOKIE)?.value);
    if (lock.enabled && !lock.unlocked) return NextResponse.json({ error: "MailClean is locked", locked: true }, { status: 423 });
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
