import type { Embedder, EmbedderIdentity } from "./embedder.js";

/**
 * Deterministic adapter for the `Embedder` port, with no network or key: the same
 * text always yields the same vector (character hash folded onto a fixed
 * dimension). Used in tests AND proves the port holds for a non-Gemini impl —
 * without being a "2nd real embedder" (cf. embedder-spi plan §2 and decision §0.2).
 */
export class FakeEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  constructor(
    dimension = 8,
    providerId = "fake",
    model = "fake-deterministic"
  ) {
    this.identity = { providerId, model, dimension };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorOf(t));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorOf(text);
  }

  private vectorOf(text: string): number[] {
    const dim = this.identity.dimension;
    const v = new Array<number>(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      v[i % dim] += text.charCodeAt(i);
    }
    return v;
  }
}
