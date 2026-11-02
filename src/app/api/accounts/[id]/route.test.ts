import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { POST as SYNC } from "./sync/route";

const params = Promise.resolve({ id: "any-account" });

beforeEach(() => vi.stubEnv("MAILCLEAN_DEMO", "1"));
afterEach(() => vi.unstubAllEnvs());

describe("account routes in the web demo", () => {
  it("never removes or rescans the shared sample accounts", async () => {
    expect((await DELETE(new Request("http://x/api/accounts/any-account", { method: "DELETE" }), { params })).status).toBe(403);
    expect((await SYNC(new Request("http://x/api/accounts/any-account/sync", { method: "POST" }), { params })).status).toBe(403);
  });
});
