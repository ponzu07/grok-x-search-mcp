import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTokens, saveTokens, tokenFilePath } from "../src/tokenStore.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gxsm-"));
  process.env.GROK_X_SEARCH_HOME = dir;
});
afterEach(() => {
  delete process.env.GROK_X_SEARCH_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = { accessToken: "AT", refreshToken: "RT", expiresAt: 123, tokenType: "Bearer" };

describe("tokenStore", () => {
  it("returns null when nothing is saved", () => {
    expect(loadTokens()).toBeNull();
  });
  it("round-trips save -> load", () => {
    saveTokens(sample);
    expect(loadTokens()).toEqual(sample);
  });
  it("writes the token file with 0600 permissions", () => {
    saveTokens(sample);
    const mode = fs.statSync(tokenFilePath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
  it("returns null for corrupt JSON (does not throw)", () => {
    saveTokens(sample);
    fs.writeFileSync(tokenFilePath(), "{ broken");
    expect(loadTokens()).toBeNull();
  });
});
