import { listDocuments } from "../lib/vector-store.js";

export const listDocumentsTool = {
  name: "list_documents",
  description: "Lists all indexed vault documents, with their type and last-updated date.",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        description: "Filter by document type",
      },
      tags: {
        type: "string",
        description: "Filter by tag (partial match)",
      },
    },
  },
  handler: async (args: { type?: string; tags?: string }) => {
    const docs = listDocuments(args.type, args.tags);

    if (docs.length === 0) {
      return { content: [{ type: "text", text: "No indexed documents." }] };
    }

    const grouped = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = grouped.get(doc.type) ?? [];
      list.push(doc);
      grouped.set(doc.type, list);
    }

    let text = `**${docs.length} indexed documents**\n\n`;
    for (const [type, typeDocs] of grouped) {
      text += `## ${type} (${typeDocs.length})\n`;
      for (const d of typeDocs) {
        text += `- \`vault/${d.path}\` — ${d.title}\n`;
      }
      text += "\n";
    }

    return { content: [{ type: "text", text }] };
  },
};
