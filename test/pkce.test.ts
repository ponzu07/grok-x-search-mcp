import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePkce, randomToken } from "../src/pkce.js";

describe("pkce", () => {
  it("challenge equals base64url(sha256(verifier))", () => {
    const { verifier, challenge } = generatePkce();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });
  it("verifier contains only base64url characters (no + / =)", () => {
    const { verifier } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("randomToken differs every call", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});
