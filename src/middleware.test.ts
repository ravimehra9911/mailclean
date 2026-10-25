import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPin, setPin, UNLOCK_COOKIE } from "@/lib/applock";
import { middleware } from "./middleware";

const TOKEN = "t".repeat(64);
let dir: string;

function req(url: string, headers: Record<string, string> = {}) {
  const u = new URL(url, "http://localhost:3000");
  return new NextRequest(u, { headers: { host: u.host, ...headers } });
}
/** True when the middleware lets the request through unchanged. */
const passes = (res: Response) => res.status === 200 && res.headers.get("x-middleware-next") === "1";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-middleware-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("MAILCLEAN_DEMO", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("MAILCLEAN_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("token", () => {
  beforeEach(() => vi.stubEnv("MAILCLEAN_TOKEN", TOKEN));

  it("is required on API routes when MAILCLEAN_TOKEN is set", () => {
    expect(middleware(req("/api/stats")).status).toBe(403);
    expect(middleware(req("/api/stats", { "x-mailclean-token": "wrong" })).status).toBe(403);
    expect(middleware(req("/api/stats", { "x-mailclean-token": TOKEN.slice(1) })).status).toBe(403);
    expect(passes(middleware(req("/api/stats", { "x-mailclean-token": TOKEN })))).toBe(true);
  });

  it("is not needed for pages or the Google sign-in routes", () => {
    expect(passes(middleware(req("/")))).toBe(true);
    expect(passes(middleware(req("/api/connect/google")))).toBe(true);
    expect(passes(middleware(req("/api/connect/google/callback?code=x")))).toBe(true);
    expect(middleware(req("/api/connect/google/other")).status).toBe(403);
  });

  it("refuses requests not addressed to localhost (DNS rebinding)", () => {
    expect(middleware(req("/", { host: "evil.example" })).status).toBe(403);
    expect(middleware(req("/api/stats", { host: "localhost.evil.example", "x-mailclean-token": TOKEN })).status).toBe(403);
    expect(passes(middleware(req("/", { host: "127.0.0.1:5173" })))).toBe(true);
  });

  it("is skipped without MAILCLEAN_TOKEN (npm run dev)", () => {
    vi.stubEnv("MAILCLEAN_TOKEN", "");
    expect(passes(middleware(req("/api/stats", { host: "anything.example" })))).toBe(true);
  });
});

describe("app lock", () => {
  it("answers 423 on API routes while locked, except /api/lock", async () => {
    setPin("123456");
    const res = middleware(req("/api/stats"));
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "MailClean is locked", locked: true });
    expect(passes(middleware(req("/api/lock")))).toBe(true);
    expect(passes(middleware(req("/api/connect/google")))).toBe(true);
    expect(middleware(req("/api/lock/other")).status).toBe(423);
    // Pages load so the lock screen can show.
    expect(passes(middleware(req("/")))).toBe(true);
  });

  it("lets requests through with the unlock cookie", () => {
    setPin("123456");
    const r = checkPin("123456");
    if (!r.ok) throw new Error("PIN rejected");
    expect(passes(middleware(req("/api/stats", { cookie: `${UNLOCK_COOKIE}=${r.token}` })))).toBe(true);
    expect(middleware(req("/api/stats", { cookie: `${UNLOCK_COOKIE}=forged` })).status).toBe(423);
  });

  it("is open when no PIN is set", () => {
    expect(passes(middleware(req("/api/stats")))).toBe(true);
  });
});

describe("hosted website and demo", () => {
  beforeEach(() => vi.stubEnv("MAILCLEAN_DEMO", "1"));

  it("redirects the old Vercel address to www.mailclean.app, keeping path and query", () => {
    const res = middleware(req("https://mailclean-gilt.vercel.app/demo?x=1"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://www.mailclean.app/demo?x=1");
  });

  it('shows the landing page at "/" and leaves other paths alone', () => {
    const home = middleware(req("https://www.mailclean.app/"));
    expect(home.headers.get("x-middleware-rewrite")).toBe("https://www.mailclean.app/site");
    expect(passes(middleware(req("https://www.mailclean.app/demo")))).toBe(true);
  });

  it("skips the token and lock checks", () => {
    vi.stubEnv("MAILCLEAN_TOKEN", TOKEN);
    setPin("123456");
    expect(passes(middleware(req("https://www.mailclean.app/api/stats")))).toBe(true);
  });
});
