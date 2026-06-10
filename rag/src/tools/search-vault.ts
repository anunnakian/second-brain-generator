import { embedQuery } from "../lib/embedder.js";
import { searchSimilar } from "../lib/vector-store.js";
import { SEARCH_DEFAULT_LIMIT } from "../lib/config.js";

export const searchVaultTool = {
  name: "search_vault",
  description:
    "Semantic search in the vault. Ask your question in natural language; the engine finds the most relevant passages by meaning similarity (not just keywords).",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Question in natural language",
      },
      type: {
        type: "string",
        description:
          "Filter by type: daily, person, topic, decision, meeting, prep-1-1, prep-day, backlog, coaching, initiative, raw-source, briefing, domain, draft, article",
      },
      tags: {
        type: "string",
        description: "Filter by tag (partial match)",
      },
      limit: {
        type: "number",
        description: `Max number of results (default: ${SEARCH_DEFAULT_LIMIT})`,
      },
    },
    required: ["query"],
  },
  handler: async (args: {
    query: string;
    type?: string;
    tags?: string;
    limit?: number;
  }) => {
    const queryEmbedding = await embedQuery(args.query);
    const results = searchSimilar(
      queryEmbedding,
      args.limit ?? SEARCH_DEFAULT_LIMIT,
      args.type,
      args.tags
    );

    if (results.length === 0) {
      return { content: [{ type: "text", text: "No results found in the vault." }] };
    }

    const text = results
      .map(
        (r, i) =>
          `### ${i + 1}. ${r.title} — ${r.section}\n` +
          `**Path:** \`vault/${r.path}\` | **Type:** ${r.type} | **Score:** ${r.score.toFixed(3)}\n\n` +
          `${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`
      )
      .join("\n\n---\n\n");

    return { content: [{ type: "text", text }] };
  },
};
