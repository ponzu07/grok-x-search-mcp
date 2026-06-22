import { describe, expect, it } from "vitest";
import { handleWebSearch, handleXSearch } from "../src/tools.js";

describe("runSearch input validation", () => {
  it("empty query is BAD_REQUEST (does not touch the network)", async () => {
    const never = (() => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const r = JSON.parse(await handleXSearch("   ", {}, never));
    expect(r).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
  it("web_search: allowed_domains with 6+ entries is BAD_REQUEST", async () => {
    const never = (() => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const r = JSON.parse(
      await handleWebSearch("q", { allowed_domains: ["1", "2", "3", "4", "5", "6"] }, never),
    );
    expect(r).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
  it("x_search: invalid from_date is BAD_REQUEST", async () => {
    const never = (() => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const r = JSON.parse(await handleXSearch("q", { from_date: "2026/01/01" }, never));
    expect(r).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
});
