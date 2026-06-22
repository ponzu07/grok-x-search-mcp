import { PENDING_AUTH_TTL_MS, XAI_OAUTH_REDIRECT_URI } from "./constants.js";
import {
  buildAuthorizeUrl,
  discoverTokenEndpoint,
  exchangeCode,
  extractAuthCode,
} from "./oauth.js";
import { generatePkce, randomToken } from "./pkce.js";
import { saveTokens } from "./tokenStore.js";
import { type PendingAuth, ToolError } from "./types.js";
import { buildToolEntry, callResponses, getValidAccessToken, resolveModel } from "./xaiClient.js";

export interface PendingStore {
  set(p: PendingAuth): void;
  take(): PendingAuth | null;
}

function ok(obj: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...obj });
}
function fail(code: string, error: string): string {
  return JSON.stringify({ ok: false, code, error });
}

export function handleLogin(pending: PendingStore): string {
  const { verifier, challenge } = generatePkce();
  const state = randomToken();
  const nonce = randomToken();
  pending.set({
    state,
    nonce,
    codeVerifier: verifier,
    codeChallenge: challenge,
    redirectUri: XAI_OAUTH_REDIRECT_URI,
    createdAt: Date.now(),
  });
  const url = buildAuthorizeUrl({
    redirectUri: XAI_OAUTH_REDIRECT_URI,
    codeChallenge: challenge,
    state,
    nonce,
  });
  return ok({
    authorize_url: url,
    expires_in_sec: PENDING_AUTH_TTL_MS / 1000,
    message:
      "Open this URL in a browser and sign in to X. After the redirect to 127.0.0.1:56121/callback, copy the `code` value from the address bar and pass it to grok_auth_callback (a full callback URL also works).",
  });
}

export async function handleCallback(
  pending: PendingStore,
  codeOrUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const p = pending.take();
  if (!p) return fail("LOGIN_EXPIRED", "No active login session. Start over from grok_login.");
  if (Date.now() - p.createdAt > PENDING_AUTH_TTL_MS) {
    return fail("LOGIN_EXPIRED", "The login session has expired. Start over from grok_login.");
  }
  try {
    const code = extractAuthCode(codeOrUrl, p.state);
    const tokenEndpoint = await discoverTokenEndpoint(fetchImpl);
    const tokens = await exchangeCode({
      tokenEndpoint,
      code,
      redirectUri: p.redirectUri,
      codeVerifier: p.codeVerifier,
      codeChallenge: p.codeChallenge,
      fetchImpl,
    });
    saveTokens(tokens);
    return ok({ message: "Login complete. x_search / web_search are ready." });
  } catch (e) {
    if (e instanceof ToolError) return fail(e.code, e.message);
    return fail("HTTP_ERROR", (e as Error).message);
  }
}

async function runSearch(
  tool: "x_search" | "web_search",
  query: string,
  opts: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!query.trim()) return fail("BAD_REQUEST", "query must not be empty.");
  if (tool === "web_search") {
    for (const k of ["allowed_domains", "excluded_domains"]) {
      const v = opts[k];
      if (Array.isArray(v) && v.length > 5)
        return fail("BAD_REQUEST", `${k} allows at most 5 entries.`);
    }
  }
  for (const k of ["from_date", "to_date"]) {
    const v = opts[k];
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
      return fail("BAD_REQUEST", `${k} must be in YYYY-MM-DD format.`);
  }
  try {
    const accessToken = await getValidAccessToken(fetchImpl);
    const model = resolveModel();
    const entry = buildToolEntry(tool, opts);
    const r = await callResponses({ accessToken, model, toolEntry: entry, query, fetchImpl });
    return ok({ text: r.text, citations: r.citations, model: r.model });
  } catch (e) {
    if (e instanceof ToolError) return fail(e.code, e.message);
    return fail("HTTP_ERROR", (e as Error).message);
  }
}

export function handleXSearch(
  query: string,
  opts: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  return runSearch("x_search", query, opts, fetchImpl);
}
export function handleWebSearch(
  query: string,
  opts: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
) {
  return runSearch("web_search", query, opts, fetchImpl);
}
