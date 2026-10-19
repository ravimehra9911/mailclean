// App lock: an optional 6-digit PIN that must be entered when MailClean opens.
// The PIN is stored as a salted scrypt hash in <DATA_DIR>/applock.json, outside the database, so the
// middleware can see whether a lock is set without opening SQLite. Unlocking sets a cookie whose value is
// an HMAC of the lock's salt with the per-launch MAILCLEAN_TOKEN, so it stops working when the app restarts
// or the PIN changes. This keeps out someone who opens the app on your computer; it is not disk encryption.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const UNLOCK_COOKIE = "mailclean_unlock";
const PIN = /^\d{6}$/;

interface LockFile {
  salt: string;
  hash: string;
  failed: number;
  /** Epoch ms before which no attempt is accepted (after repeated wrong PINs). */
  waitUntil: number;
}

const dataDir = () => process.env.DATA_DIR || (process.env.VERCEL ? "/tmp/mailclean" : path.join(process.cwd(), ".data"));
export const lockFilePath = () => path.join(dataDir(), "applock.json");

function read(): LockFile | null {
  try { return JSON.parse(fs.readFileSync(lockFilePath(), "utf8")) as LockFile; } catch { return null; }
}
function write(f: LockFile) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(lockFilePath(), JSON.stringify(f), { mode: 0o600 });
}

const hashPin = (pin: string, salt: string) => crypto.scryptSync(pin, salt, 32, { N: 16384 }).toString("hex");

/** Per-launch secret: the desktop token, or a random one for `npm run dev`. */
function secret() {
  const g = globalThis as { __mailcleanLockSecret?: string };
  return process.env.MAILCLEAN_TOKEN || (g.__mailcleanLockSecret ??= crypto.randomBytes(32).toString("hex"));
}

/** Cookie value that proves this launch was unlocked with the current PIN. */
export function unlockToken(salt: string) {
  return crypto.createHmac("sha256", secret()).update(`mailclean-unlock:${salt}`).digest("hex");
}

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && PIN.test(pin);

export function lockStatus(cookie: string | undefined) {
  const f = read();
  if (!f) return { enabled: false, unlocked: true, waitMs: 0 };
  const expected = unlockToken(f.salt);
  const unlocked = !!cookie && cookie.length === expected.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
  return { enabled: true, unlocked, waitMs: Math.max(0, f.waitUntil - Date.now()) };
}

/** Sets a new PIN and returns the cookie value that unlocks it. */
export function setPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  write({ salt, hash: hashPin(pin, salt), failed: 0, waitUntil: 0 });
  return unlockToken(salt);
}

/**
 * Checks a PIN. After 5 wrong tries each further wrong try makes you wait longer (30 s, 1 min, 2 min…
 * up to 1 hour), so the 1,000,000 combinations can't be tried quickly.
 */
export function checkPin(pin: string): { ok: true; token: string } | { ok: false; waitMs: number; left: number } {
  const f = read();
  if (!f) return { ok: false, waitMs: 0, left: 0 };
  const now = Date.now();
  if (f.waitUntil > now) return { ok: false, waitMs: f.waitUntil - now, left: 0 };
  const a = Buffer.from(hashPin(pin, f.salt), "hex");
  if (crypto.timingSafeEqual(a, Buffer.from(f.hash, "hex"))) {
    write({ ...f, failed: 0, waitUntil: 0 });
    return { ok: true, token: unlockToken(f.salt) };
  }
  const failed = f.failed + 1;
  const waitMs = failed >= 5 ? Math.min(3600_000, 30_000 * 2 ** (failed - 5)) : 0;
  write({ ...f, failed, waitUntil: now + waitMs });
  return { ok: false, waitMs, left: Math.max(0, 5 - failed) };
}

export function removePin() {
  fs.rmSync(lockFilePath(), { force: true });
}
