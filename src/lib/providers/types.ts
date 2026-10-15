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

export async function fetchJson<T>(url: string, init: RequestInit = {}, tries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return (res.status === 204 ? {} : await res.json()) as T;
    // Back off on rate limits and transient errors.
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    const body = await res.text();
    throw new HttpError(res.status, `${init.method || "GET"} ${url.split("?")[0]} → ${res.status}: ${body.slice(0, 300)}`);
  }
}

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
