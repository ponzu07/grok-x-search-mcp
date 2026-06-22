import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  HTTP_TIMEOUT_MS,
  TOKEN_REFRESH_SKEW_MS,
  XAI_API_RESPONSES_URL,
} from "./constants.js";
import { discoverTokenEndpoint, refreshTokens } from "./oauth.js";
import { loadTokens, saveTokens } from "./tokenStore.js";
import { ToolError } from "./types.js";

export function resolveModel(): string {
  const m = process.env.GROK_X_SEARCH_MODEL?.trim();
  if (m && (ALLOWED_MODELS as readonly string[]).includes(m)) return m;
  return DEFAULT_MODEL;
}

export async function getValidAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new ToolError("NO_AUTH", "Not logged in. Run grok_login first.");
  }
  if (tokens.expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return tokens.accessToken;
  }
  try {
    const tokenEndpoint = await discoverTokenEndpoint(fetchImpl);
    const refreshed = await refreshTokens({
      tokenEndpoint,
      refreshToken: tokens.refreshToken,
      fetchImpl,
    });
    saveTokens(refreshed);
    return refreshed.accessToken;
  } catch {
    throw new ToolError("EXPIRED", "Failed to refresh the token. Log in again with grok_login.");
  }
}

type SearchTool = "x_search" | "web_search";

export function buildToolEntry(
  tool: SearchTool,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: tool };
  const nonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
  if (tool === "x_search") {
    if (nonEmptyArr(opts.allowed_x_handles)) entry.allowed_x_handles = opts.allowed_x_handles;
    if (nonEmptyArr(opts.excluded_x_handles)) entry.excluded_x_handles = opts.excluded_x_handles;
    if (opts.from_date) entry.from_date = opts.from_date;
    if (opts.to_date) entry.to_date = opts.to_date;
  } else {
    const filters: Record<string, unknown> = {};
    if (nonEmptyArr(opts.allowed_domains)) filters.allowed_domains = opts.allowed_domains;
    if (nonEmptyArr(opts.excluded_domains)) filters.excluded_domains = opts.excluded_domains;
    if (Object.keys(filters).length > 0) entry.filters = filters;
    if (opts.enable_image_search) entry.enable_image_search = true;
  }
  return entry;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function extractText(body: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const item of asArray(body.output)) {
    const it = asRecord(item);
    if (it.type !== "message") continue;
    for (const c of asArray(it.content)) {
      const ct = asRecord(c);
      if (ct.type === "output_text" && typeof ct.text === "string") parts.push(ct.text);
    }
  }
  if (parts.length > 0) return parts.join("\n");
  if (typeof body.output_text === "string") return body.output_text;
  return JSON.stringify(body);
}

function extractCitations(body: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const item of asArray(body.output)) {
    const it = asRecord(item);
    if (it.type !== "message") continue;
    for (const c of asArray(it.content)) {
      const ct = asRecord(c);
      for (const a of asArray(ct.annotations)) {
        const an = asRecord(a);
        if (an.type === "url_citation" && typeof an.url === "string") urls.push(an.url);
      }
    }
  }
  if (urls.length > 0) return [...new Set(urls)];
  if (Array.isArray(body.citations)) {
    return (body.citations as unknown[]).filter((c): c is string => typeof c === "string");
  }
  return [];
}

export async function callResponses(input: {
  accessToken: string;
  model: string;
  toolEntry: Record<string, unknown>;
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; citations: string[]; model: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(XAI_API_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: [{ role: "user", content: input.query }],
        tools: [input.toolEntry],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ToolError(
      "HTTP_ERROR",
      `Search request failed (timeout/network error): ${(e as Error).name}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    const raw = text.length > 500 ? `${text.slice(0, 500)}...(truncated)` : text;
    let detail = raw;
    try {
      const j = JSON.parse(text) as { code?: unknown; error?: unknown };
      const code = typeof j.code === "string" ? `[${j.code}] ` : "";
      const msg = typeof j.error === "string" ? j.error : "";
      detail = (code + msg).trim() || raw;
    } catch {}
    if (res.status === 401) {
      throw new ToolError(
        "EXPIRED",
        `xAI API 401 (token rejected): ${detail}. Log in again with grok_login.`,
      );
    }
    const errCode = res.status === 403 ? "FORBIDDEN_403" : "HTTP_ERROR";
    throw new ToolError(errCode, `xAI API ${res.status}: ${detail}`);
  }
  const body = JSON.parse(text) as Record<string, unknown>;
  return { text: extractText(body), citations: extractCitations(body), model: input.model };
}
