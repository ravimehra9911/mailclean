import type { MessageMeta } from "../db";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
}

export interface SyncHooks {
  getToken: () => Promise<string>;
  onTotal: (total: number) => void;
  onBatch: (rows: MessageMeta[]) => void;
  /** Return true for message ids already stored, so they are not re-fetched. */
  isKnown: (id: string) => boolean;
  /** Called for every id seen, known or new, so stale rows can be swept afterwards. */
  onSeen: (id: string) => void;
  limit: number;
}

export interface MailProvider {
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet & { email: string }>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Returns true if every message was walked (no limit hit). */
  sync(hooks: SyncHooks): Promise<boolean>;
  trash(token: string, ids: string[]): Promise<void>;
  archive(token: string, ids: string[]): Promise<void>;
}

export const APP_URL = () => process.env.APP_URL || "http://localhost:3000";

export async function fetchJson<T>(url: string, init: RequestInit = {}, tries = 6, retryQuota = true): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
    const body = await res.text();
    // Gmail reports per-user quota limits as 403 rateLimitExceeded / "Quota exceeded"; they reset each minute.
    const quota = res.status === 403 && /rateLimitExceeded|Quota exceeded/i.test(body);
    if ((res.status === 429 || res.status >= 500 || (quota && retryQuota)) && attempt < tries) {
      const fallback = quota || res.status === 429 ? Math.min(60, 10 * 2 ** attempt) : 2 ** attempt;
      const retryAfter = Number(res.headers.get("retry-after")) || fallback;
      console.warn(`[rate limit] ${res.status} on ${url.split("?")[0]} — retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    throw new HttpError(res.status, `${init.method || "GET"} ${url.split("?")[0]} → ${res.status}: ${body.slice(0, 300)}`);
  }
}

/**
 * Spaces out API calls so their quota cost stays under a rate that adapts to the server:
 * a quota error pauses every caller and cuts the rate; steady success slowly raises it again.
 */
export class RateLimiter {
  private next = 0;
  constructor(private rate: number, private min = 10, private max = 200) {}
  get unitsPerSecond() { return this.rate; }
  async take(units: number) {
    const now = Date.now();
    const start = Math.max(now, this.next);
    this.next = start + (units / this.rate) * 1000;
    if (start > now) await new Promise((r) => setTimeout(r, start - now));
  }
  penalize(pauseMs: number) {
    this.rate = Math.max(this.min, this.rate * 0.6);
    this.next = Math.max(this.next, Date.now() + pauseMs);
  }
  reward() {
    this.rate = Math.min(this.max, this.rate + 0.2);
  }
}

export const isQuotaError = (e: unknown) =>
  e instanceof HttpError && (e.status === 429 || (e.status === 403 && /rateLimitExceeded|Quota exceeded/i.test(e.message)));

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Run fn over items with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
