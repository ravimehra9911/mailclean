import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPin, isValidPin, lockFilePath, lockStatus, removePin, setPin } from "./applock";

const PIN = "123456";
const WRONG = "000000";
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-applock-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("isValidPin", () => {
  it("accepts exactly six digits", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
    expect(isValidPin(123456)).toBe(false);
  });
});

describe("app lock", () => {
  it("is unlocked when no PIN is set", () => {
    expect(lockStatus(undefined)).toEqual({ enabled: false, unlocked: true, waitMs: 0 });
    expect(checkPin(PIN)).toEqual({ ok: false, waitMs: 0, left: 0 });
  });

  it("stores the lock in DATA_DIR and unlocks with the returned cookie", () => {
    const token = setPin(PIN);
    expect(lockFilePath()).toBe(path.join(dir, "applock.json"));
    expect(fs.existsSync(lockFilePath())).toBe(true);
    expect(fs.readFileSync(lockFilePath(), "utf8")).not.toContain(PIN);
    expect(lockStatus(undefined)).toEqual({ enabled: true, unlocked: false, waitMs: 0 });
    expect(lockStatus("nope")).toMatchObject({ unlocked: false });
    expect(lockStatus(token)).toEqual({ enabled: true, unlocked: true, waitMs: 0 });
  });

  it("accepts the right PIN", () => {
    const token = setPin(PIN);
    expect(checkPin(PIN)).toEqual({ ok: true, token });
  });

  it("allows five wrong tries before making you wait", () => {
    setPin(PIN);
    for (const left of [4, 3, 2, 1]) expect(checkPin(WRONG)).toEqual({ ok: false, waitMs: 0, left });
    expect(checkPin(WRONG)).toEqual({ ok: false, waitMs: 30_000, left: 0 });
    expect(lockStatus(undefined).waitMs).toBe(30_000);
  });

  it("refuses every attempt, even the right PIN, while waiting", () => {
    setPin(PIN);
    for (let i = 0; i < 5; i++) checkPin(WRONG);
    vi.advanceTimersByTime(10_000);
    expect(checkPin(PIN)).toEqual({ ok: false, waitMs: 20_000, left: 0 });
    vi.advanceTimersByTime(20_000);
    expect(checkPin(PIN)).toMatchObject({ ok: true });
  });

  it("doubles the wait after each further wrong try, up to one hour", () => {
    setPin(PIN);
    const waits: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = checkPin(WRONG);
      if (!r.ok) waits.push(r.waitMs);
      vi.advanceTimersByTime(r.ok ? 0 : r.waitMs);
    }
    expect(waits.slice(4)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000, 3_600_000]);
  });

  it("resets the counter after the right PIN", () => {
    setPin(PIN);
    for (let i = 0; i < 4; i++) checkPin(WRONG);
    expect(checkPin(PIN)).toMatchObject({ ok: true });
    expect(checkPin(WRONG)).toEqual({ ok: false, waitMs: 0, left: 4 });
  });

  it("stops accepting the old cookie when the PIN changes", () => {
    const first = setPin(PIN);
    const second = setPin("654321");
    expect(second).not.toBe(first);
    expect(lockStatus(first).unlocked).toBe(false);
    expect(lockStatus(second).unlocked).toBe(true);
  });

  it("removes the lock", () => {
    setPin(PIN);
    removePin();
    expect(lockStatus(undefined)).toEqual({ enabled: false, unlocked: true, waitMs: 0 });
  });
});
