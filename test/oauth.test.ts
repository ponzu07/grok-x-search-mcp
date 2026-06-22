import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  discoverTokenEndpoint,
  exchangeCode,
  extractAuthCode,
  refreshTokens,
} from "../src/oauth.js";
import { ToolError } from "../src/types.js";

describe("buildAuthorizeUrl", () => {
  it("includes all required parameters", () => {
    const url = new URL(
      buildAuthorizeUrl({
        redirectUri: "http://127.0.0.1:56121/callback",
        codeChallenge: "chal",
        state: "st",
        nonce: "no",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://auth.x.ai/oauth2/authorize");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("b1a00492-073a-47ea-816f-4c329264a828");
    expect(p.get("redirect_uri")).toBe("http://127.0.0.1:56121/callback");
    expect(p.get("code_challenge")).toBe("chal");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("st");
    expect(p.get("nonce")).toBe("no");
    expect(p.get("plan")).toBe("generic");
    expect(p.get("referrer")).toBe("grok-x-search-mcp");
    expect(p.get("scope")).toContain("grok-cli:access");
  });
});

describe("extractAuthCode", () => {
  it("extracts code from a full callback URL and checks state match", () => {
    const code = extractAuthCode("http://127.0.0.1:56121/callback?code=abc&state=st", "st");
    expect(code).toBe("abc");
  });
  it("accepts a bare authorization code (no state check)", () => {
    const code = extractAuthCode("V02lXODL-bare_code_123", "st");
    expect(code).toBe("V02lXODL-bare_code_123");
  });
  it("trims surrounding whitespace from a bare code", () => {
    expect(extractAuthCode("  abc123  ", "st")).toBe("abc123");
  });
  it("accepts a raw query string containing code=", () => {
    expect(extractAuthCode("?code=abc&state=st", "st")).toBe("abc");
  });
  it("throws on empty input", () => {
    expect(() => extractAuthCode("   ", "st")).toThrow(ToolError);
  });
  it("throws STATE_MISMATCH on state mismatch in a URL", () => {
    expect(() =>
      extractAuthCode("http://127.0.0.1:56121/callback?code=abc&state=zzz", "st"),
    ).toThrow(ToolError);
  });
  it("throws when an error parameter is present", () => {
    expect(() => extractAuthCode("http://x/callback?error=access_denied", "st")).toThrow(
      /access_denied/,
    );
  });
  it("throws BAD_REQUEST when a URL is missing the code", () => {
    expect(() => extractAuthCode("http://x/callback?state=st", "st")).toThrow(ToolError);
  });
});

function mockFetch(responses: Array<{ ok: boolean; status: number; body: unknown }>) {
  let i = 0;
  return async () => {
    const r = responses[i++];
    return {
      ok: r.ok,
      status: r.status,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  };
}

describe("discoverTokenEndpoint", () => {
  it("returns the token_endpoint", async () => {
    const f = mockFetch([
      { ok: true, status: 200, body: { token_endpoint: "https://auth.x.ai/oauth2/token" } },
    ]);
    const ep = await discoverTokenEndpoint(f as unknown as typeof fetch);
    expect(ep).toBe("https://auth.x.ai/oauth2/token");
  });
});

describe("exchangeCode", () => {
  it("returns a TokenSet with access/refresh tokens", async () => {
    const f = mockFetch([
      {
        ok: true,
        status: 200,
        body: { access_token: "AT", refresh_token: "RT", expires_in: 3600, token_type: "Bearer" },
      },
    ]);
    const t = await exchangeCode({
      tokenEndpoint: "https://auth.x.ai/oauth2/token",
      code: "c",
      redirectUri: "http://127.0.0.1:56121/callback",
      codeVerifier: "v",
      codeChallenge: "ch",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(t.accessToken).toBe("AT");
    expect(t.refreshToken).toBe("RT");
    expect(t.expiresAt).toBeGreaterThan(Date.now());
  });
  it("throws ToolError(HTTP_ERROR) on HTTP error; body is truncated", async () => {
    const f = mockFetch([{ ok: false, status: 400, body: { error: "invalid_grant" } }]);
    await expect(
      exchangeCode({
        tokenEndpoint: "https://auth.x.ai/oauth2/token",
        code: "c",
        redirectUri: "r",
        codeVerifier: "v",
        codeChallenge: "ch",
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/400/);
  });
});

describe("refreshTokens", () => {
  it("carries over the original refresh_token when none is returned", async () => {
    const f = mockFetch([
      { ok: true, status: 200, body: { access_token: "AT2", expires_in: 3600 } },
    ]);
    const t = await refreshTokens({
      tokenEndpoint: "https://auth.x.ai/oauth2/token",
      refreshToken: "RT_OLD",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(t.accessToken).toBe("AT2");
    expect(t.refreshToken).toBe("RT_OLD");
  });
});
