import type { MessageMeta } from "../db";
import { parseFrom, parseListUnsubscribe } from "../headers";
import { APP_URL, chunk, fetchJson, HttpError, pool, type MailProvider, type TokenSet } from "./types";

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
    const profile = await fetchJson<{ messagesTotal: number }>(`${API}/profile`, { headers: auth(await getToken()) });
    onTotal(Math.min(profile.messagesTotal, limit));

    let pageToken: string | undefined;
    let walked = 0;
    do {
      const q = new URLSearchParams({ maxResults: "500" });
      if (pageToken) q.set("pageToken", pageToken);
      const page = await fetchJson<{ messages?: { id: string }[]; nextPageToken?: string }>(
        `${API}/messages?${q}`, { headers: auth(await getToken()) });
      const ids = (page.messages ?? []).map((m) => m.id).slice(0, limit - walked);
      walked += ids.length;
      ids.forEach(onSeen);

      const fresh = ids.filter((id) => !isKnown(id));
      const token = await getToken();
      const metaQ = "format=metadata&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post"
        + "&fields=id,labelIds,sizeEstimate,internalDate,payload/headers";
      // messages.get costs 5 quota units; ~10 in flight stays under the 250 units/sec per-user limit.
      const msgs = await pool(fresh, 10, (id) =>
        fetchJson<GmailMessage>(`${API}/messages/${id}?${metaQ}`, { headers: auth(token) }).catch((e) => {
          if (e instanceof HttpError && e.status === 404) return null; // deleted mid-sync
          throw e;
        }));
      onBatch(msgs.filter((m): m is GmailMessage => !!m).map(toMeta));

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
