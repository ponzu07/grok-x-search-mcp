# grok-x-search-mcp

一个 stdio MCP 服务器，通过 OAuth 使用 X Premium / SuperGrok 订阅，从 Claude Code（或 Codex）调用 xAI 的 `x_search` / `web_search`。

**语言:** [English](README.md) | [日本語](README.ja.md) | 中文

## 注册

无需安装或构建 —— `npx` 会自动拉取并运行已发布的包。

### Claude Code

```bash
claude mcp add grok-x-search -- npx -y grok-x-search-mcp
```

### Codex CLI

```bash
codex mcp add grok-x-search -- npx -y grok-x-search-mcp
```

## 登录

认证通过 AI 助手完成。用自然语言让它去调用工具即可。

1. 让助手登录（它会调用 `grok_login`）:

   > 登录 grok-x-search。

2. 助手返回 `authorize_url`，在浏览器中打开并登录 X。随后被重定向到 `http://127.0.0.1:56121/callback?code=...`（页面无需加载成功）。

3. 复制其中的 `code` 值（或整个 URL）交回给助手（它会调用 `grok_auth_callback`）:

   > 用这个回调完成登录: http://127.0.0.1:56121/callback?code=...

令牌保存在 `~/.config/grok-x-search-mcp/auth.json`。登出请删除该文件。

## 工具

| 工具 | 参数 |
|---|---|
| `grok_login` | （无） |
| `grok_auth_callback` | `code` |
| `x_search` | `query`（必填）, `allowed_x_handles?`, `excluded_x_handles?`, `from_date?`（YYYY-MM-DD）, `to_date?` |
| `web_search` | `query`（必填）, `allowed_domains?`（最多 5）, `excluded_domains?`（最多 5）, `enable_image_search?` |

## 环境变量

- `GROK_X_SEARCH_MODEL`（默认 `grok-4.3`）
- `GROK_X_SEARCH_HOME`（令牌目录覆盖）

## 许可证

[MIT](LICENSE)
