// Markdown assembly — the thin contract golden-source-sync writes into the vault (PRD §6):
// the produced body plus mandatory citation frontmatter. This is *what golden-source-sync
// writes*, not a RAG requirement. Frontmatter via gray-matter (js-yaml under the hood).

import matter from 'gray-matter';
import type { SourceItem } from '../domain/ports.js';

/** The frontmatter stamped on every produced note (PRD §6). */
export interface GoldenSourceFrontmatter {
  golden_source: string;
  source_id: string;
  title: string;
  /** Source URL — indispensable for the citation (without it, no clickable link). */
  source_url: string;
  /** Notion last_edited_time — feeds the watermark. */
  last_edited_time: string;
}

/** Assemble one note: produced body + mandatory citation frontmatter (PRD §6). */
export function toGoldenSourceMarkdown(
  goldenSource: string,
  item: SourceItem,
  body: string,
): string {
  const frontmatter: GoldenSourceFrontmatter = {
    golden_source: goldenSource,
    source_id: item.id,
    title: item.title,
    source_url: item.url,
    last_edited_time: item.lastEditedTime,
  };
  return matter.stringify(body, frontmatter);
}
