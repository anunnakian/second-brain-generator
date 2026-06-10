import { getStats } from "../lib/vector-store.js";

export const vaultStatsTool = {
  name: "vault_stats",
  description: "Shows index statistics: number of documents, chunks, and breakdown by type.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  handler: async () => {
    const stats = getStats();
    const typeLines = stats.types
      .map((t) => `  - ${t.type}: ${t.n}`)
      .join("\n");

    const text =
      `**Vault index**\n` +
      `- Documents: ${stats.docCount}\n` +
      `- Chunks: ${stats.chunkCount}\n` +
      `- By type:\n${typeLines}`;

    return { content: [{ type: "text", text }] };
  },
};
