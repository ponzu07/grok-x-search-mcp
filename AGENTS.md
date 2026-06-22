# AGENTS.md

Maintenance/handoff guide for AI assistants and human contributors. Read this before changing code.

## What this is

`grok-x-search-mcp` is an **unofficial stdio MCP server** that exposes xAI's
`x_search` / `web_search` as MCP tools. It authenticates with an **X Premium /
SuperGrok subscription via OAuth** (PKCE) instead of an `XAI_API_KEY`, so there
is no metered API billing. Designed for Claude Code / Codex on Linux (XDG).

## Architecture

Source is `src/*.ts`, compiled to `dist/*.js` (ESM, `tsc`). Each file has one
job:

- `server.ts` — MCP entry point (`bin`). Registers 4 tools (`grok_login`,
  `grok_auth_callback`, `x_search`, `web_search`) on an `McpServer` over stdio.
  Owns the in-memory `PendingStore` (single pending login). Has the `#!/usr/bin/env node` shebang required for `npx`.
- `tools.ts` — tool handlers. `handleLogin` / `handleCallback` (OAuth) and
  `runSearch` (shared by `x_search` / `web_search`). Input validation lives here
  (empty query, max-5 domains, `YYYY-MM-DD` dates). Returns JSON strings
  `{ ok: true, ... }` or `{ ok: false, code, error }`.
- `oauth.ts` — OAuth primitives: `buildAuthorizeUrl`, `extractAuthCode`
  (accepts a bare code, a full callback URL, or a `code=` query string),
  `discoverTokenEndpoint` (OIDC discovery, validates host endsWith `x.ai`),
  `exchangeCode`, `refreshTokens`.
- `xaiClient.ts` — calls xAI Responses API. `getValidAccessToken` (loads token,
  refreshes if within `TOKEN_REFRESH_SKEW_MS`), `buildToolEntry` (maps options
  to the API tool entry shape), `callResponses` (POST, extracts text + citations
  from the `output[].message.content[].output_text` shape with legacy
  fallbacks), `resolveModel`.
- `tokenStore.ts` — token persistence at `~/.config/grok-x-search-mcp/auth.json`
  (XDG-aware), written atomically with mode `0600`.
- `pkce.ts` — PKCE verifier/challenge + random tokens (`node:crypto`).
- `constants.ts` — all OAuth/API constants and tuning values.
- `types.ts` — `TokenSet`, `PendingAuth`, `ToolError` + error codes.

Tests mirror sources in `test/*.ts` (vitest). Network is always mocked via an
injected `fetchImpl`; tests never hit the real API.

## Auth flow (important)

1. `grok_login` → builds an authorize URL and stores PKCE state in memory.
2. User opens the URL, signs in to X, gets redirected to
   `http://127.0.0.1:56121/callback?code=...` (the page need not load).
3. `grok_auth_callback` ← the `code` (or full URL). Exchanges code → tokens,
   saves them. Refresh is automatic thereafter.

This reuses the **public desktop OAuth `client_id` of the Hermes Agent / Grok
CLI flow** (in `constants.ts`). It is a public client (no secret).

### Things verified empirically — do not "fix" without re-verifying

- `XAI_OAUTH_REFERRER` is a **free-form client identifier**, NOT validated
  against the borrowed `client_id`. A custom value (`grok-x-search-mcp`) was
  verified end-to-end (authorize → token → real `web_search`, no 403). It only
  matters at login time; changing it does not affect already-saved tokens.
- The Responses output shape is `output[]` (type `message`) →
  `content[]` (type `output_text`) → `text`, with citations in
  `annotations[]` (type `url_citation`). `xaiClient.ts` keeps legacy fallbacks.
- `auth.x.ai` sits behind Cloudflare; raw non-browser requests to the authorize
  endpoint get a Cloudflare 403. Real OAuth verification needs a browser login
  with a subscription account — it cannot be done from CI or curl.

### Common runtime failure

- `403 personal-team-blocked:spending-limit` → the user logged in with an xAI
  identity (`sub`) NOT tied to their subscription. Fix is to re-login with the
  correct X account, not a code change.

## Conventions

- **No comments in source.** Code is kept self-explanatory; explanatory/justification comments are treated as noise and removed. Keep it that way.
- All user-facing strings (errors, tool descriptions) are **English**.
- README is split: `README.md` (English, canonical) + `README.ja.md` +
  `README.zh.md`, kept minimal (commands + essentials, no prose/warnings).
- No secrets in the repo. `*.local.md` is gitignored (local notes).

## Build / test / run

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest (mocked network)
npm start          # node dist/server.js (stdio; expects an MCP client)
```

Node >= 22 (`engines`; lowest Node line still in LTS). Runtime deps are pinned
to exact versions so `npx` always runs the tested combination.

## Release

CI/CD via GitHub Actions:

- `.github/workflows/ci.yml` — build + test on push(main)/PR.
- `.github/workflows/publish.yml` — on `v*` tag push, `npm publish`
  (build+test run via `prepublishOnly`; provenance enabled).

Release flow:

```bash
npm version patch        # bumps version, commits, creates the vX.Y.Z tag
git push --follow-tags   # tag push triggers the publish workflow
```

Publishing auth: bootstrap with an npm **Automation token** stored as the
`NPM_TOKEN` GitHub secret. Recommended end state is **Trusted Publishing
(OIDC)** configured on npmjs after the first publish (then the token can be
removed and `--provenance` keeps working via `id-token: write`).

`grok-x-search-mcp` is the published npm name (unscoped, public). The package
name `x-search-mcp` was already taken on npm.

## When changing things

- Don't change `XAI_OAUTH_CLIENT_ID` / `XAI_OAUTH_SCOPE` casually — they pair
  with the borrowed client.
- Keep network injectable (`fetchImpl`) so tests stay offline.
- Update all three READMEs together when user-facing behavior changes.
- Bump `version` in `package.json` only via `npm version` (keeps tag in sync).
