import { CATEGORY_PRIORITY, type MessageMeta } from "../db";
import { parseFrom, parseListUnsubscribe } from "../headers";
import { APP_URL, chunk, fetchJson, HttpError, isQuotaError, pool, RateLimiter, type MailProvider, type TokenSet } from "./types";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
// gmail.modify is the narrowest scope that allows trash/archive. We still only request metadata.
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"];
const redirectUri = () => `${APP_URL()}/api/connect/google/callback`;

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; }
interface GmailMessage {
  id: string;
  labelIds?: string[];
  sizeEstimate?: number;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

function toMeta(m: GmailMessage): MessageMeta {
  const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
  const from = parseFrom(h("From"));
  const unsub = parseListUnsubscribe(h("List-Unsubscribe"), h("List-Unsubscribe-Post"));
  const labels = m.labelIds ?? [];
  return {
    msg_id: m.id,
    from_email: from.email,
    from_name: from.name,
    date: Number(m.internalDate) || Date.now(),
    size: m.sizeEstimate ?? 0,
    unread: labels.includes("UNREAD"),
    in_inbox: labels.includes("INBOX"),
    unsub_http: unsub.http,
    unsub_mailto: unsub.mailto,
    one_click: unsub.oneClick,
    // Gmail API labels: CATEGORY_PROMOTIONS etc.; anything else is Primary (CATEGORY_PERSONAL).
    category: CATEGORY_PRIORITY.find((c) => labels.includes(`CATEGORY_${c.toUpperCase()}`)) ?? "primary",
    starred: labels.includes("STARRED"),
    important: labels.includes("IMPORTANT"),
  };
}

export const google: MailProvider = {
  authUrl(state) {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  async exchangeCode(code) {
    const t = await fetchJson<TokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const profile = await fetchJson<{ emailAddress: string }>(`${API}/profile`, { headers: auth(t.access_token) });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in, email: profile.emailAddress };
  },

  async refresh(refreshToken): Promise<TokenSet> {
    const t = await fetchJson<TokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }),
    });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in };
  },

  async sync({ getToken, onTotal, onBatch, isKnown, onSeen, limit }) {
    // Gmail charges quota units per call (profile 1, messages.list 5, messages.get 5) and caps units per user
    // per minute. The cap varies by project, so the limiter adapts: start at 100 units/sec and back off on 403s.
    const limiter = new RateLimiter(100);
    const call = async <T>(units: number, url: string): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        await limiter.take(units);
        try {
          const r = await fetchJson<T>(url, { headers: auth(await getToken()) }, 4, false);
          limiter.reward();
          return r;
        } catch (e) {
          if (!isQuotaError(e) || attempt >= 8) throw e;
          limiter.penalize(15_000);
          console.warn(`[gmail quota] backing off; now ${limiter.unitsPerSecond.toFixed(0)} units/sec`);
        }
      }
    };

    const profile = await call<{ messagesTotal: number }>(1, `${API}/profile`);
    onTotal(Math.min(profile.messagesTotal, limit));

    const metaQ = "format=metadata&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post"
      + "&fields=id,labelIds,sizeEstimate,internalDate,payload/headers";
    let pageToken: string | undefined;
    let walked = 0;
    do {
      const q = new URLSearchParams({ maxResults: "500" });
      if (pageToken) q.set("pageToken", pageToken);
      const page = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(5, `${API}/messages?${q}`);
      const ids = (page.messages ?? []).map((m) => m.id).slice(0, limit - walked);
      walked += ids.length;

      // Save every 100 messages so an interrupted scan keeps its progress; a rescan skips stored ids.
      for (const part of chunk(ids, 100)) {
        const msgs = await pool(part.filter((id) => !isKnown(id)), 8, (id) =>
          call<GmailMessage>(5, `${API}/messages/${id}?${metaQ}`).catch((e) => {
            if (e instanceof HttpError && e.status === 404) return null; // deleted mid-sync
            throw e;
          }));
        part.forEach(onSeen);
        onBatch(msgs.filter((m): m is GmailMessage => !!m).map(toMeta));
      }

      pageToken = page.nextPageToken;
    } while (pageToken && walked < limit);
    return !pageToken;
  },

  async trash(token, ids) {
    for (const part of chunk(ids, 1000)) {
      try {
        await fetchJson(`${API}/messages/batchModify`, {
          method: "POST",
          headers: { ...auth(token), "Content-Type": "application/json" },
          body: JSON.stringify({ ids: part, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
        });
      } catch {
        // Fallback: trash one by one.
        await pool(part, 10, (id) => fetchJson(`${API}/messages/${id}/trash`, { method: "POST", headers: auth(token) }));
      }
    }
  },

  async archive(token, ids) {
    for (const part of chunk(ids, 1000)) {
      await fetchJson(`${API}/messages/batchModify`, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: part, removeLabelIds: ["INBOX"] }),
      });
    }
  },
};
