# grok-x-search-mcp

X Premium / SuperGrok の OAuth を使い、Claude Code（や Codex）から xAI の `x_search` / `web_search` を呼ぶ stdio MCP サーバー。

**言語:** [English](README.md) | 日本語 | [中文](README.zh.md)

## 登録

インストールやビルドは不要 — `npx` が公開パッケージを取得して実行します。

### Claude Code

```bash
claude mcp add grok-x-search -- npx -y grok-x-search-mcp
```

### Codex CLI

```bash
codex mcp add grok-x-search -- npx -y grok-x-search-mcp
```

## ログイン

認証は AI アシスタント経由で行う。普通の言葉で頼めば、アシスタントがツールを呼んでくれる。

1. アシスタントにログインを依頼（`grok_login` が呼ばれる）:

   > grok-x-search にログインして。

2. `authorize_url` が返るので、ブラウザで開いて X にログイン。`http://127.0.0.1:56121/callback?code=...` にリダイレクトされる（ページは読み込めなくてよい）。

3. その `code` の値（またはURL全体）をアシスタントに渡す（`grok_auth_callback` が呼ばれる）:

   > このコールバックでログインを完了して: http://127.0.0.1:56121/callback?code=...

トークンは `~/.config/grok-x-search-mcp/auth.json` に保存される。ログアウトはこのファイルを削除。

## ツール

| ツール | 引数 |
|---|---|
| `grok_login` | （なし） |
| `grok_auth_callback` | `code` |
| `x_search` | `query`（必須）, `allowed_x_handles?`, `excluded_x_handles?`, `from_date?`（YYYY-MM-DD）, `to_date?` |
| `web_search` | `query`（必須）, `allowed_domains?`（最大5）, `excluded_domains?`（最大5）, `enable_image_search?` |

## 環境変数

- `GROK_X_SEARCH_MODEL`（既定 `grok-4.3`）
- `GROK_X_SEARCH_HOME`（トークン保存ディレクトリの上書き）

## ライセンス

[MIT](LICENSE)
