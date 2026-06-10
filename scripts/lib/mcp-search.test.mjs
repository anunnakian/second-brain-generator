import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mcpSearch } from "./mcp-search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, "__fixtures__", "stub-mcp-server.mjs");

test("mcpSearch issues N queries on one session and correlates each response to its query", async () => {
  const results = await mcpSearch({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    queries: ["first question", "second question"],
    timeoutMs: 5000,
    env: { STUB_SEARCH: "echo" },
  });

  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { query: "first question", text: "query=first question" });
  assert.deepEqual(results[1], { query: "second question", text: "query=second question" });
});

test("mcpSearch rejects loudly if the MCP server dies (no fake score)", async () => {
  await assert.rejects(
    mcpSearch({
      command: process.execPath,
      args: [STUB],
      cwd: HERE,
      queries: ["q"],
      timeoutMs: 5000,
      env: { STUB_MODE: "crash" },
    }),
    /exited|MCP/i
  );
});
