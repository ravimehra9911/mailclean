// Parsing helpers for the few headers we read: From, Date and List-Unsubscribe.

/** Decodes RFC 2047 encoded words, e.g. "=?UTF-8?B?w4lsaWU=?=" → "Élie", as used in sender names. */
export function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(?:\s+(?==\?))?/g, (_m, charset: string, enc: string, text: string) => {
    const bytes = enc.toUpperCase() === "B"
      ? Buffer.from(text, "base64")
      : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_h, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    try {
      return new TextDecoder(charset.split("*")[0].trim()).decode(bytes);
    } catch {
      return bytes.toString("utf8");
    }
  });
}

/** First address in a From header: `"Name" <a@b.c>`, `Name <a@b.c>` or a bare `a@b.c`. */
export function parseFrom(raw: string | undefined | null): { email: string; name: string | null } {
  if (!raw) return { email: "unknown", name: null };
  const value = decodeWords(raw).trim();
  const angle = value.match(/^(.*?)<([^>]+)>/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1").trim();
    return { email: angle[2].trim().toLowerCase(), name: name || null };
  }
  // "a@b.c (Name)" or just "a@b.c"
  const bare = value.match(/^([^\s,()]+@[^\s,()]+)\s*(?:\(([^)]*)\))?/);
  if (bare) return { email: bare[1].toLowerCase(), name: bare[2]?.trim() || null };
  return { email: value.toLowerCase(), name: null };
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
