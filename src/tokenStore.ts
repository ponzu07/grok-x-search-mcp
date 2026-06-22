import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TokenSet } from "./types.js";

function baseDir(): string {
  if (process.env.GROK_X_SEARCH_HOME) return process.env.GROK_X_SEARCH_HOME;
  const xdg = process.env.XDG_CONFIG_HOME;
  const root = xdg?.trim() ? xdg : path.join(os.homedir(), ".config");
  return path.join(root, "grok-x-search-mcp");
}

export function tokenFilePath(): string {
  return path.join(baseDir(), "auth.json");
}

export function loadTokens(): TokenSet | null {
  try {
    const raw = fs.readFileSync(tokenFilePath(), "utf8");
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  const dir = baseDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `auth.json.tmp-${process.pid}`);
  fs.writeFileSync(tmp, JSON.stringify(tokens), { mode: 0o600 });
  fs.renameSync(tmp, tokenFilePath());
  fs.chmodSync(tokenFilePath(), 0o600);
}
