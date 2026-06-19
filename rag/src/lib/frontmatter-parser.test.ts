import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "./frontmatter-parser.js";

test("prefers the frontmatter title over the filename fallback", () => {
  // Local-mirror pages are named by Notion pageId (a UUID) and carry the real title
  // only in the frontmatter — with no '# Heading' in the body. Without this precedence,
  // parsed.title would be the UUID and the title chunk would be useless for retrieval.
  const raw = "---\ntitle: Naxos\nmirror: travel\n---\n";

  const parsed = parseDocument(raw, "mirrors/travel/8c1f2a3b.md");

  assert.equal(parsed.title, "Naxos");
});

test("exposes the mirror source_url from the frontmatter (clickable Notion link)", () => {
  const raw = "---\ntitle: Naxos\nsource_url: https://www.notion.so/abc\n---\n";

  const parsed = parseDocument(raw, "mirrors/travel/8c1f2a3b.md");

  assert.equal(parsed.sourceUrl, "https://www.notion.so/abc");
});

test("sourceUrl is null when the note has no source_url (non-mirror note)", () => {
  const raw = "---\ntitle: Plain\n---\n# Plain\n";

  const parsed = parseDocument(raw, "topics/plain.md");

  assert.equal(parsed.sourceUrl, null);
});
