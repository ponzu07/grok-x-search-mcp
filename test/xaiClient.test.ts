import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveTokens } from "../src/tokenStore.js";
import { buildToolEntry, callResponses, getValidAccessToken } from "../src/xaiClient.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gxsm-"));
  process.env.GROK_X_SEARCH_HOME = dir;
});
afterEach(() => {
  delete process.env.GROK_X_SEARCH_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getValidAccessToken", () => {
  it("throws NO_AUTH when no token is saved", async () => {
    await expect(
      getValidAccessToken(() => {
        throw new Error("no net");
      }),
    ).rejects.toMatchObject({ code: "NO_AUTH" });
  });
  it("returns the token as-is when not near expiry", async () => {
    saveTokens({
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 3_600_000,
      tokenType: "Bearer",
    });
    const at = await getValidAccessToken(() => {
      throw new Error("no net");
    });
    expect(at).toBe("AT");
  });
  it("refreshes and returns a new token when near expiry", async () => {
    saveTokens({
      accessToken: "OLD",
      refreshToken: "RT",
      expiresAt: Date.now() + 1000,
      tokenType: "Bearer",
    });
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ token_endpoint: "https://auth.x.ai/oauth2/token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: "NEW", expires_in: 3600 }),
      });
    const at = await getValidAccessToken(f as unknown as typeof fetch);
    expect(at).toBe("NEW");
  });
});

describe("buildToolEntry", () => {
  it("x_search omits empty-array options", () => {
    const e = buildToolEntry("x_search", { allowed_x_handles: [], from_date: "2026-01-01" });
    expect(e).toEqual({ type: "x_search", from_date: "2026-01-01" });
  });
  it("web_search groups domains under filters", () => {
    const e = buildToolEntry("web_search", {
      allowed_domains: ["a.com"],
      enable_image_search: true,
    });
    expect(e).toEqual({
      type: "web_search",
      filters: { allowed_domains: ["a.com"] },
      enable_image_search: true,
    });
  });
});

describe("callResponses", () => {
  it("403 maps to FORBIDDEN_403 and surfaces xAI's error body (code/error)", async () => {
    const body = {
      code: "personal-team-blocked:spending-limit",
      error: "You have run out of credits or need a Grok subscription.",
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => JSON.stringify(body) });
    await expect(
      callResponses({
        accessToken: "AT",
        model: "grok-4.3",
        toolEntry: { type: "x_search" },
        query: "q",
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN_403",
      message: expect.stringContaining("personal-team-blocked:spending-limit"),
    });
  });
  it("401 maps to EXPIRED and hints re-login", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "invalid token" });
    await expect(
      callResponses({
        accessToken: "AT",
        model: "grok-4.3",
        toolEntry: { type: "x_search" },
        query: "q",
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "EXPIRED",
      message: expect.stringContaining("grok_login"),
    });
  });
  it("surfaces raw text for non-JSON error bodies", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "upstream boom" });
    await expect(
      callResponses({
        accessToken: "AT",
        model: "grok-4.3",
        toolEntry: { type: "x_search" },
        query: "q",
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      message: expect.stringContaining("upstream boom"),
    });
  });
  it("extracts text and citations on success", async () => {
    const body = { output_text: "answer", citations: ["https://x.com/a"] };
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    const r = await callResponses({
      accessToken: "AT",
      model: "grok-4.3",
      toolEntry: { type: "x_search" },
      query: "q",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(r.text).toBe("answer");
    expect(r.citations).toEqual(["https://x.com/a"]);
  });
  it("extracts from the real Responses shape (output/message/output_text/annotations)", async () => {
    const body = {
      output: [
        { type: "reasoning", summary: [] },
        { type: "custom_tool_call" },
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "result text",
              annotations: [
                { type: "url_citation", url: "https://x.com/elonmusk/status/1", title: "1" },
                { type: "url_citation", url: "https://x.com/elonmusk/status/2", title: "2" },
              ],
            },
          ],
        },
      ],
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    const r = await callResponses({
      accessToken: "AT",
      model: "grok-4.3",
      toolEntry: { type: "x_search" },
      query: "q",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(r.text).toBe("result text");
    expect(r.citations).toEqual([
      "https://x.com/elonmusk/status/1",
      "https://x.com/elonmusk/status/2",
    ]);
  });
  it("does not throw on unknown responses and returns empty citations", async () => {
    const f = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ weird: 1 }),
    });
    const r = await callResponses({
      accessToken: "AT",
      model: "grok-4.3",
      toolEntry: { type: "x_search" },
      query: "q",
      fetchImpl: f as unknown as typeof fetch,
    });
    expect(r.citations).toEqual([]);
    expect(typeof r.text).toBe("string");
  });
});
