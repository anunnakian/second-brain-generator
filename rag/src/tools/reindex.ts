import { reindex } from "../lib/index-manager.js";

export const reindexTool = {
  name: "reindex",
  description:
    "Rebuilds the vault index. Incremental by default (only re-indexes modified files). Use force=true to rebuild everything.",
  inputSchema: {
    type: "object" as const,
    properties: {
      force: {
        type: "boolean",
        description: "Force a full re-index (default: false)",
      },
    },
  },
  handler: async (args: { force?: boolean }) => {
    const result = await reindex(args.force ?? false);
    const lines = [
      `**Indexing complete**`,
      `- Files scanned: ${result.scanned}`,
      `- Indexed: ${result.indexed}`,
      `- Unchanged (skipped): ${result.skipped}`,
      `- Removed from index: ${result.removed}`,
    ];
    if (result.errors.length > 0) {
      lines.push(`- Errors: ${result.errors.length}`);
      for (const err of result.errors.slice(0, 5)) {
        lines.push(`  - ${err}`);
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
};
