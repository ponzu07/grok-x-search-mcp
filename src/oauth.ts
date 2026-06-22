import {
  HTTP_TIMEOUT_MS,
  XAI_OAUTH_AUTHORIZE_URL,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_DISCOVERY_URL,
  XAI_OAUTH_PLAN,
  XAI_OAUTH_REFERRER,
  XAI_OAUTH_SCOPE,
} from "./constants.js";
import { type TokenSet, ToolError } from "./types.js";

export function buildAuthorizeUrl(input: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL(XAI_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", XAI_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", XAI_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("plan", XAI_OAUTH_PLAN);
  url.searchParams.set("referrer", XAI_OAUTH_REFERRER);
  return url.toString();
}

export function extractAuthCode(input: string, expectedState: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ToolError(
      "BAD_REQUEST",
      "Empty input. Paste the authorization code (or the full callback URL).",
    );
  }

  const params = (() => {
    try {
      return new URL(trimmed).searchParams;
    } catch {
      return trimmed.includes("code=") ? new URLSearchParams(trimmed.replace(/^\?/, "")) : null;
    }
  })();

  if (!params) {
    return trimmed;
  }

  const err = params.get("error");
  if (err) {
    const desc = params.get("error_description") ?? err;
    throw new ToolError("HTTP_ERROR", `Authorization was denied: ${desc}`);
  }
  const code = params.get("code");
  if (!code) {
    throw new ToolError("BAD_REQUEST", "The callback URL does not contain a `code` parameter.");
  }
  if (params.get("state") !== expectedState) {
    throw new ToolError("STATE_MISMATCH", "State mismatch. Start over from grok_login.");
  }
  return code;
}

function redact(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}...(truncated)` : text;
}

export async function discoverTokenEndpoint(fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(XAI_OAUTH_DISCOVERY_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ToolError("HTTP_ERROR", `OIDC discovery failed (HTTP ${res.status})`);
  }
  const json = JSON.parse(await res.text()) as { token_endpoint?: string };
  const ep = String(json.token_endpoint ?? "").trim();
  try {
    const u = new URL(ep);
    if (u.protocol !== "https:" || !(u.hostname === "x.ai" || u.hostname.endsWith(".x.ai"))) {
      throw new Error();
    }
  } catch {
    throw new ToolError("HTTP_ERROR", "Discovery did not return a valid token_endpoint.");
  }
  return ep;
}

function toTokenSet(
  payload: Record<string, unknown>,
  startedAt: number,
  fallbackRefresh = "",
): TokenSet {
  const accessToken = String(payload.access_token ?? "").trim();
  const refreshToken = String(payload.refresh_token ?? fallbackRefresh).trim();
  if (!accessToken) throw new ToolError("HTTP_ERROR", "Response is missing access_token.");
  if (!refreshToken) throw new ToolError("HTTP_ERROR", "Response is missing refresh_token.");
  const expiresInSec = Number(payload.expires_in ?? 3600);
  return {
    accessToken,
    refreshToken,
    expiresAt: startedAt + expiresInSec * 1000,
    idToken: String(payload.id_token ?? "").trim() || undefined,
    tokenType: String(payload.token_type ?? "Bearer").trim() || "Bearer",
  };
}

async function postToken(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
  fallbackRefresh = "",
): Promise<TokenSet> {
  const startedAt = Date.now();
  const res = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ToolError("HTTP_ERROR", `Token endpoint error (HTTP ${res.status}): ${redact(text)}`);
  }
  return toTokenSet(JSON.parse(text) as Record<string, unknown>, startedAt, fallbackRefresh);
}

export function exchangeCode(input: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  codeChallenge: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: XAI_OAUTH_CLIENT_ID,
    code_verifier: input.codeVerifier,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return postToken(input.tokenEndpoint, body, input.fetchImpl ?? fetch);
}

export function refreshTokens(input: {
  tokenEndpoint: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: XAI_OAUTH_CLIENT_ID,
    refresh_token: input.refreshToken,
  });
  return postToken(input.tokenEndpoint, body, input.fetchImpl ?? fetch, input.refreshToken);
}
