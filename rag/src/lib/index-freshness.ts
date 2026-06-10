import type { EmbedderIdentity } from "./vector-store.js";

/**
 * Freshness verdict for the index against the current embedder. When stale,
 * it carries **both identities** (stamped vs current) for an actionable message
 * on the conversation side (cf. confirm-gate, embedder-spi plan §4).
 */
export type FreshnessVerdict =
  | { fresh: true }
  | {
      fresh: false;
      stamped: EmbedderIdentity | null;
      current: EmbedderIdentity;
    };

/**
 * Compares the identity stamped in the index to that of the current embedder.
 * Mismatch → stale. Rather than a search that lies silently, we surface an
 * explicit signal (the project's fail-loud spirit).
 */
/**
 * Should we (re)stamp the index after this run? We only set a **new**
 * identity when the index truly reflects it: either a `force` (everything is
 * re-encoded with the current embedder), or an index still free of any stamp
 * (fresh install / index from before this plan). Incrementally on an already-
 * stamped index, we don't touch it: if the embedder changed outside the gate, the
 * guard still detects it (we never dress up the index as "fresh").
 */
export function shouldStamp(
  force: boolean,
  existing: EmbedderIdentity | null
): boolean {
  return force || existing === null;
}

/**
 * Confirm-gate prose (natural language), relayed by Claude when the index is
 * stale. Names the models DYNAMICALLY via the identity — nothing is hardcoded
 * as "Gemini". By default we reindex NOTHING: we ask, we wait for the "yes"
 * (cf. embedder-spi plan §4). The MCP contract doesn't change: this is just text.
 */
export function staleIndexMessage(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): string {
  const before = stamped ? `before: ${stamped.model}, ` : "";
  return (
    `My fast, semantic search capabilities rely on an indexer/embedder; ` +
    `but its configuration has changed (${before}now: ${current.model}). ` +
    `To keep working, I need to re-index your documents — they don't change, ` +
    `it's just that they have to be re-encoded with the new model. ` +
    `This may take a little while. Do you want me to do it now?`
  );
}

export function checkIndexFreshness(
  stamped: EmbedderIdentity | null,
  current: EmbedderIdentity
): FreshnessVerdict {
  if (
    stamped !== null &&
    stamped.providerId === current.providerId &&
    stamped.model === current.model &&
    stamped.dimension === current.dimension
  ) {
    return { fresh: true };
  }
  return { fresh: false, stamped, current };
}
