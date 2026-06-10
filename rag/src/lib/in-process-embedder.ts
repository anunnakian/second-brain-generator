import type { Embedder, EmbedderIdentity } from "./embedder.js";

/** ONNX quantization of the model (q8 = default: light, near-full quality). */
export type Dtype = "fp32" | "q8" | "q4";

/**
 * A model's task prompts. Some models (EmbeddingGemma) are trained with a distinct
 * prefix on the query side vs the document side and lose quality without them —
 * others (bge-m3) don't want them. Absent = raw text.
 */
export interface TaskPrompts {
  query: string;
  document: string;
}

/**
 * Default batch cap. ONNX attention is O(seq²)×batch: sending all the chunks of a
 * long note at once blows up the RAM (measured: a 78-chunk note → 8.5 GB and stall).
 * A 4/8/16 sweep on a dense corpus (264 notes): the SMALL batch wins on both axes
 * (RAM AND time) — 4 = peak ~3.2 GB / 5.3 min, vs 16 = 5.4 GB / 7.4 min. Quality is
 * unchanged (each text is embedded independently). See the Step 4-ter plan +
 * eval-set.md.
 */
export const EMBED_BATCH = 4;

/** Config of the in-process adapter (ONNX model + dimension + quantization + prompts). */
export interface InProcessConfig {
  model: string;
  dimension: number;
  dtype?: Dtype;
  prompts?: TaskPrompts;
  /** Max size of a sub-batch sent to the pipeline (bounds the RAM). Default: `EMBED_BATCH`. */
  batchSize?: number;
}

/** Minimal output tensor the adapter needs (subset of Transformers.js). */
export interface FeatureExtractionTensor {
  tolist(): number[][];
}

/** Transformers.js's `feature-extraction` pipeline, reduced to what we call. */
export type FeatureExtractor = (
  input: string | string[],
  opts: { pooling: "mean"; normalize: boolean }
) => Promise<FeatureExtractionTensor>;

/** Loads (and downloads on first use) the ONNX pipeline — injectable to test without weights. */
export type LoadExtractor = () => Promise<FeatureExtractor>;

// EmbeddingGemma's official prompts (model card): a distinct prefix on the search
// side vs the document side. Ollama applies them internally; in-process it's up to
// us to set them, otherwise quality drops (cf. Step 4-bis measurement).
const EMBEDDING_GEMMA_PROMPTS: TaskPrompts = {
  query: "task: search result | query: ",
  document: "title: none | text: ",
};

/**
 * Task prompts to apply for a given model, or `undefined` if the model doesn't
 * expect any (bge-m3, e5…). Model-specific knowledge isolated here (pure, testable):
 * selection uses it to configure the adapter without hard-coding the model.
 */
export function promptsForModel(model: string): TaskPrompts | undefined {
  return /embeddinggemma/i.test(model) ? EMBEDDING_GEMMA_PROMPTS : undefined;
}

/**
 * Default real loader: imports Transformers.js **lazily** (dynamic import) and
 * builds the `feature-extraction` pipeline for the wanted model/quantization. The
 * weights are downloaded+cached on the first call, then everything runs offline and
 * on CPU. Isolated here so unit tests can inject a fake extractor (zero weights).
 */
function makeDefaultLoad(config: InProcessConfig): LoadExtractor {
  return async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", config.model, {
      dtype: config.dtype ?? "q8",
    });
    return extractor as unknown as FeatureExtractor;
  };
}

/**
 * Adapter for the `Embedder` port that loads the model **inside the Node process**
 * via Transformers.js (ONNX runtime), with no server or app to install (no Ollama).
 * "Gemma inside": `npm i` pulls the embedder, the weights download+cache on first
 * use and then everything is offline. See study §3 ter + Step 4-bis plan.
 */
export class InProcessEmbedder implements Embedder {
  readonly identity: EmbedderIdentity;

  // Memoized pipeline: loaded only once (model expensive to bring into memory),
  // reused for all embeds. On failure, nothing is cached → the next call retries.
  private extractorPromise: Promise<FeatureExtractor> | null = null;

  constructor(
    private readonly config: InProcessConfig,
    private readonly loadExtractor: LoadExtractor = makeDefaultLoad(config)
  ) {
    this.identity = {
      providerId: "transformers-js",
      model: config.model,
      dimension: config.dimension,
    };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const prefix = this.config.prompts?.document ?? "";
    return this.embed(texts.map((t) => prefix + t));
  }

  async embedQuery(text: string): Promise<number[]> {
    const prefix = this.config.prompts?.query ?? "";
    const vectors = await this.embed([prefix + text]);
    return vectors[0];
  }

  /**
   * Encodes the texts in **bounded sub-batches** (mean pooling + L2 normalization).
   * The cap avoids onnxruntime's RAM blow-up on long notes; the vectors are
   * reconcatenated in their original order.
   */
  private async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const batchSize = this.config.batchSize ?? EMBED_BATCH;
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const tensor = await extractor(texts.slice(i, i + batchSize), {
        pooling: "mean",
        normalize: true,
      });
      vectors.push(...tensor.tolist());
    }
    return vectors;
  }

  /**
   * Loads the pipeline. If loading fails (weights not downloadable, runtime
   * missing…), throws a **loud** error that names the model — never a silent empty
   * vector that would poison the index.
   */
  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadExtractor().catch((cause) => {
        // Failure → forget the promise so a future call retries loading.
        this.extractorPromise = null;
        throw new Error(
          `Unable to load the in-process model "${this.config.model}" ` +
            `(Transformers.js). Cause: ${cause instanceof Error ? cause.message : cause}`
        );
      });
    }
    return this.extractorPromise;
  }
}
