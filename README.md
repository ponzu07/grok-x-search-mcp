# grok-x-search-mcp

A stdio MCP server that calls xAI's `x_search` / `web_search` from Claude Code (or Codex) using an X Premium / SuperGrok subscription via OAuth.

**Languages:** English | [日本語](README.ja.md) | [中文](README.zh.md)

## Register

No install or build needed — `npx` fetches and runs the published package.

### Claude Code

```bash
claude mcp add grok-x-search -- npx -y grok-x-search-mcp
```

### Codex CLI

```bash
codex mcp add grok-x-search -- npx -y grok-x-search-mcp
```

## Login

Authentication runs through your AI assistant — ask it in plain language and it calls the tools for you.

1. Tell the assistant to log in (it invokes `grok_login`):

   > Log in to grok-x-search.

2. It replies with an `authorize_url`. Open it in a browser and sign in to X. You are redirected to `http://127.0.0.1:56121/callback?code=...` (the page need not load).

3. Copy the `code` value (or the whole URL) and hand it back (it invokes `grok_auth_callback`):

   > Finish the login with this callback: http://127.0.0.1:56121/callback?code=...

Tokens are stored at `~/.config/grok-x-search-mcp/auth.json`. To log out, delete that file.

## Tools

| Tool | Arguments |
|---|---|
| `grok_login` | (none) |
| `grok_auth_callback` | `code` |
| `x_search` | `query` (required), `allowed_x_handles?`, `excluded_x_handles?`, `from_date?` (YYYY-MM-DD), `to_date?` |
| `web_search` | `query` (required), `allowed_domains?` (max 5), `excluded_domains?` (max 5), `enable_image_search?` |

## Environment variables

- `GROK_X_SEARCH_MODEL` (default `grok-4.3`)
- `GROK_X_SEARCH_HOME` (token directory override)

## License

[MIT](LICENSE)
