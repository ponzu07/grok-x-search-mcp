#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

import type { PendingStore } from "./tools.js";
import { handleCallback, handleLogin, handleWebSearch, handleXSearch } from "./tools.js";
import type { PendingAuth } from "./types.js";

function createPendingStore(): PendingStore {
  let current: PendingAuth | null = null;
  return {
    set(p) {
      current = p;
    },
    take() {
      const c = current;
      current = null;
      return c;
    },
  };
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

async function main(): Promise<void> {
  const pending = createPendingStore();
  const server = new McpServer({ name: "grok-x-search-mcp", version });

  server.registerTool(
    "grok_login",
    {
      description:
        "Start the OAuth login to xAI (SuperGrok / X Premium) and return the authorize URL.",
      inputSchema: {},
    },
    async (_args) => text(handleLogin(pending)),
  );

  server.registerTool(
    "grok_auth_callback",
    {
      description:
        "Complete login by passing the authorization code from the redirect (the full callback URL is also accepted).",
      inputSchema: {
        code: z
          .string()
          .describe(
            "The `code` value from the 127.0.0.1:56121/callback redirect (a full callback URL also works)",
          ),
      },
    },
    async ({ code }) => text(await handleCallback(pending, code)),
  );

  server.registerTool(
    "x_search",
    {
      description:
        "Search posts on X (Twitter) and return Grok's synthesized answer with citations.",
      inputSchema: {
        query: z.string().min(1),
        allowed_x_handles: z.array(z.string()).optional(),
        excluded_x_handles: z.array(z.string()).optional(),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
      },
    },
    async ({ query, ...opts }) => text(await handleXSearch(query, opts)),
  );

  server.registerTool(
    "web_search",
    {
      description: "Search the web and return Grok's synthesized answer with citations.",
      inputSchema: {
        query: z.string().min(1),
        allowed_domains: z.array(z.string()).optional(),
        excluded_domains: z.array(z.string()).optional(),
        enable_image_search: z.boolean().optional(),
      },
    },
    async ({ query, ...opts }) => text(await handleWebSearch(query, opts)),
  );

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error("grok-x-search-mcp failed to start:", e);
  process.exit(1);
});
