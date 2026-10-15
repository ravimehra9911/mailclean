import type { MessageMeta } from "../db";
import { parseListUnsubscribe } from "../headers";
import { APP_URL, chunk, fetchJson, HttpError, pool, type MailProvider, type TokenSet } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TENANT = () => process.env.MICROSOFT_TENANT || "common"; // "common" = personal + work accounts
const SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.ReadWrite"];
const redirectUri = () => `${APP_URL()}/api/connect/microsoft/callback`;
const tokenUrl = () => `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/token`;
// PR_MESSAGE_SIZE: Graph has no size property, so read the MAPI one.
const SIZE_PROP = "Integer 0x0E08";

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; }
interface GraphMessage {
  id: string;
  receivedDateTime: string;
  isRead: boolean;
  parentFolderId: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  internetMessageHeaders?: { name: string; value: string }[];
  singleValueExtendedProperties?: { id: string; value: string }[];
}

// Immutable IDs stay the same when a message moves folders (trash/archive).
const auth = (t: string) => ({ Authorization: `Bearer ${t}`, Prefer: 'IdType="ImmutableId"' });

function toMeta(m: GraphMessage, inboxId: string): MessageMeta {
  const h = (name: string) => m.internetMessageHeaders?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
  const unsub = parseListUnsubscribe(h("List-Unsubscribe"), h("List-Unsubscribe-Post"));
  return {
    msg_id: m.id,
    from_email: (m.from?.emailAddress?.address ?? "unknown").toLowerCase(),
    from_name: m.from?.emailAddress?.name || null,
    date: Date.parse(m.receivedDateTime) || Date.now(),
    size: Number(m.singleValueExtendedProperties?.[0]?.value) || 0,
    unread: !m.isRead,
    in_inbox: m.parentFolderId === inboxId,
    unsub_http: unsub.http,
    unsub_mailto: unsub.mailto,
    one_click: unsub.oneClick,
  };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  return fetchJson<TokenResponse>(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      scope: SCOPES.join(" "),
      ...params,
    }),
  });
}

/** Move messages with Graph JSON batching (max 20 requests per batch). */
async function moveAll(token: string, ids: string[], destinationId: string) {
  await pool(chunk(ids, 20), 3, async (part) => {
    const res = await fetchJson<{ responses: { id: string; status: number }[] }>(`${GRAPH}/$batch`, {
      method: "POST",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: part.map((id, i) => ({
          id: String(i),
          method: "POST",
          url: `/me/messages/${id}/move`,
          headers: { "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"' },
          body: { destinationId },
        })),
      }),
    });
    const failed = res.responses.filter((r) => r.status >= 400 && r.status !== 404);
    if (failed.length) throw new Error(`${failed.length} of ${part.length} messages could not be moved`);
  });
}

export const microsoft: MailProvider = {
  authUrl(state) {
    const p = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      redirect_uri: redirectUri(),
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.join(" "),
      prompt: "select_account",
      state,
    });
    return `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/authorize?${p}`;
  },

  async exchangeCode(code) {
    const t = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: "authorization_code" });
    const me = await fetchJson<{ mail?: string; userPrincipalName: string }>(`${GRAPH}/me?$select=mail,userPrincipalName`, {
      headers: auth(t.access_token),
    });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresIn: t.expires_in,
      email: (me.mail || me.userPrincipalName).toLowerCase(),
    };
  },

  async refresh(refreshToken): Promise<TokenSet> {
    // Microsoft rotates refresh tokens, so the new one must be saved.
    const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in };
  },

  async sync({ getToken, onTotal, onBatch, isKnown, onSeen, limit }) {
    const folder = async (name: string) =>
      (await fetchJson<{ id: string; totalItemCount: number }>(`${GRAPH}/me/mailFolders/${name}?$select=id,totalItemCount`, {
        headers: auth(await getToken()),
      }));
    const [inbox, deleted, junk] = await Promise.all([folder("inbox"), folder("deleteditems"), folder("junkemail")]);
    const skip = new Set([deleted.id, junk.id]);

    try {
      const count = await fetch(`${GRAPH}/me/messages/$count`, { headers: { ...auth(await getToken()), ConsistencyLevel: "eventual" } });
      if (count.ok) onTotal(Math.min(Number(await count.text()) - deleted.totalItemCount - junk.totalItemCount, limit));
    } catch { /* total is only for the progress bar */ }

    const select = "id,receivedDateTime,isRead,parentFolderId,from";
    const expand = `singleValueExtendedProperties($filter=id eq '${SIZE_PROP}')`;
    let withHeaders = true;
    let next: string | undefined =
      `${GRAPH}/me/messages?$top=250&$select=${select},internetMessageHeaders&$expand=${encodeURIComponent(expand)}`;
    let walked = 0;

    while (next && walked < limit) {
      let page: { value: GraphMessage[]; "@odata.nextLink"?: string };
      try {
        page = await fetchJson(next, { headers: auth(await getToken()) });
      } catch (e) {
        // Some tenants reject internetMessageHeaders in list queries; retry without (no unsubscribe info).
        if (withHeaders && e instanceof HttpError && e.status === 400) {
          withHeaders = false;
          next = `${GRAPH}/me/messages?$top=250&$select=${select}&$expand=${encodeURIComponent(expand)}`;
          continue;
        }
        throw e;
      }
      const rows = page.value.filter((m) => !skip.has(m.parentFolderId)).slice(0, limit - walked);
      walked += rows.length;
      rows.forEach((m) => onSeen(m.id));
      onBatch(rows.filter((m) => !isKnown(m.id)).map((m) => toMeta(m, inbox.id)));
      next = page["@odata.nextLink"];
    }
    return !next;
  },

  trash: (token, ids) => moveAll(token, ids, "deleteditems"),
  archive: (token, ids) => moveAll(token, ids, "archive"),
};
