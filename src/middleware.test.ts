import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

const TOKEN = "t".repeat(64);
let dir: string;

function req(url: string, headers: Record<string, string> = {}, method = "GET") {
  const u = new URL(url, "http://localhost:3000");
  return new NextRequest(u, { method, headers: { host: u.host, ...headers } });
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

describe("without MAILCLEAN_TOKEN (npm run dev / npm start)", () => {
  it("lets the app's own pages call the API", () => {
    expect(passes(middleware(req("/api/stats")))).toBe(true);
    expect(passes(middleware(req("/api/clean", { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }, "POST")))).toBe(true);
    expect(passes(middleware(req("http://127.0.0.1:3000/api/stats", { origin: "http://127.0.0.1:3000" })))).toBe(true);
  });

  it("refuses API requests from other websites", () => {
    const evil = { origin: "https://evil.example" };
    expect(middleware(req("/api/clean", evil, "POST")).status).toBe(403);
    expect(middleware(req("/api/lock", evil, "POST")).status).toBe(403);
    expect(middleware(req("/api/stats", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    // Another port on localhost is "same-site" to the browser, but not the same origin.
    expect(middleware(req("/api/clean", { origin: "http://localhost:8080", "sec-fetch-site": "same-site" }, "POST")).status).toBe(403);
    expect(middleware(req("/api/clean", { origin: "null" }, "POST")).status).toBe(403);
  });

  it("accepts the public host passed on by a reverse proxy", () => {
    const headers = { host: "127.0.0.1:3000", "x-forwarded-host": "mail.example.org", origin: "https://mail.example.org" };
    expect(passes(middleware(req("http://127.0.0.1:3000/api/stats", headers)))).toBe(true);
  });

  it("keeps pages and the Google sign-in routes open to cross-site navigation", () => {
    const cross = { "sec-fetch-site": "cross-site" };
    expect(passes(middleware(req("/", cross)))).toBe(true);
    expect(passes(middleware(req("/api/connect/google", cross)))).toBe(true);
    expect(passes(middleware(req("/api/connect/google/callback?code=x&state=y", { ...cross, origin: "https://accounts.google.com" })))).toBe(true);
  });
});

describe("with MAILCLEAN_TOKEN (desktop app)", () => {
  beforeEach(() => vi.stubEnv("MAILCLEAN_TOKEN", TOKEN));

  it("still requires the token and a localhost host", () => {
    expect(middleware(req("/api/stats")).status).toBe(403);
    expect(passes(middleware(req("/api/stats", { "x-mailclean-token": TOKEN })))).toBe(true);
    expect(middleware(req("/", { host: "evil.example" })).status).toBe(403);
  });
});

describe("hosted website and demo", () => {
  beforeEach(() => vi.stubEnv("MAILCLEAN_DEMO", "1"));

  it("skips the cross-site check", () => {
    expect(passes(middleware(req("https://www.mailclean.app/api/stats", { origin: "https://evil.example", "sec-fetch-site": "cross-site" })))).toBe(true);
  });

  it("still redirects the old Vercel address and rewrites the landing page", () => {
    expect(middleware(req("https://mailclean-gilt.vercel.app/demo?x=1")).headers.get("location")).toBe("https://www.mailclean.app/demo?x=1");
    expect(middleware(req("https://www.mailclean.app/")).headers.get("x-middleware-rewrite")).toBe("https://www.mailclean.app/site");
  });
});
