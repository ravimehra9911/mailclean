// Parsing helpers for the few headers we read: From and List-Unsubscribe.

export function parseFrom(raw: string | undefined | null): { email: string; name: string | null } {
  if (!raw) return { email: "unknown", name: null };
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

export function parseListUnsubscribe(
  header: string | undefined | null,
  postHeader: string | undefined | null,
): { http: string | null; mailto: string | null; oneClick: boolean } {
  if (!header) return { http: null, mailto: null, oneClick: false };
  const parts = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  const http = parts.find((p) => /^https:\/\//i.test(p)) ?? null;
  const mailto = parts.find((p) => /^mailto:/i.test(p)) ?? null;
  // RFC 8058: one-click requires an https URI plus "List-Unsubscribe=One-Click" in List-Unsubscribe-Post.
  const oneClick = !!http && !!postHeader && /List-Unsubscribe=One-Click/i.test(postHeader);
  return { http, mailto, oneClick };
}
