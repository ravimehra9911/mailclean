// Client-side types and fetch helpers shared by the dashboard components.

import type { GmailCategory } from "./categories";

export interface Account {
  id: string;
  provider: string; // see providerInfo() in src/lib/catalog.ts
  email: string;
  sync_status: "idle" | "syncing" | "done" | "error";
  sync_error: string | null;
  synced: number;
  total: number;
  last_sync_at: number | null;
  notice: string | null;
}

export interface Overview {
  emails: number;
  bytes: number;
  unread: number;
  top10Share: number;
  mostlyUnreadSenders: number;
  senders: number;
  newsletters: number;
  daily: { day: string; count: number }[];
  byAccount: AccountShare[];
  years: number[];
  categories: { category: GmailCategory; count: number; unread: number; bytes: number }[];
  suggestions: {
    old: { count: number; bytes: number; before: number };
    neverOpened: { senders: number; count: number; bytes: number };
    newsletters: { count: number; bytes: number };
    freeable: { count: number; bytes: number };
  };
}

export interface AccountShare {
  account_id: string;
  provider: string;
  email: string;
  count: number;
  bytes: number;
  unread: number;
}


export interface Sender {
  email: string;
  name: string | null;
  count: number;
  bytes: number;
  unread: number;
  inbox: number;
  first: number;
  last: number;
  accounts: string;
  byAccount: AccountShare[];
  can_unsub: number;
  unsubscribed: number;
  category: GmailCategory | null;
  category_share: number;
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json();
  // The app was locked (PIN set and not unlocked in this session): show the lock screen.
  if (res.status === 423) window.dispatchEvent(new Event("mailclean-locked"));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const fmtBytes = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
export const fmtNum = (n: number) => n.toLocaleString("en-IN");
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
