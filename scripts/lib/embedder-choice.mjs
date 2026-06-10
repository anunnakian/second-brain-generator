// ═══════════════════════════════════════════════════════════════════════════
// embedder-choice.mjs — PURE logic for the install-time embedder choice.
// No I/O: takes { platform, arch, totalMemBytes }, returns the recommendation,
// the 3-option menu and the matching .env lines. Decision D1 (ADR 0007).
// ═══════════════════════════════════════════════════════════════════════════
import { hasGeminiKey, geminiKeyRequired } from "./gemini-key.mjs";

// The in-process embedder (Transformers.js + onnxruntime-node 1.24.3) has NO
// prebuilt binary for Mac Intel (darwin/x64) → option unavailable there.
export function inProcessAvailable({ platform, arch }) {
  return !(platform === "darwin" && arch === "x64");
}

// RAM threshold (frozen by Thomas, D1) above which in-process is recommended.
// Below it, in-process climbs to ~6 GB while indexing a real vault → swaps → the
// API key (RAM ~0) is the safer bet. Peak RAM measured in Step 4-ter.
const IN_PROCESS_MIN_RAM_BYTES = 12 * 1024 ** 3;

// Adaptive recommendation D1: in-process if the machine supports it AND has
// enough RAM; otherwise the API key (safe fallback, RAM ~0).
export function recommendedEmbedderKey({ platform, arch, totalMemBytes }) {
  if (inProcessAvailable({ platform, arch }) && totalMemBytes >= IN_PROCESS_MIN_RAM_BYTES) {
    return "in-process";
  }
  return "api";
}

// The 3 install-menu options, ordered from most to least private (ADR 0007
// addendum D1). On Mac Intel the in-process option is dropped (unavailable) and
// the numbers tighten up. The option recommended for THIS machine carries ⭐.
export function buildEmbedderOptions({ platform, arch, totalMemBytes }) {
  const recommended = recommendedEmbedderKey({ platform, arch, totalMemBytes });
  const keys = ["in-process", "api", "ollama"].filter(
    (k) => k !== "in-process" || inProcessAvailable({ platform, arch }),
  );
  return keys.map((key, i) => ({
    num: i + 1,
    key,
    recommended: key === recommended,
  }));
}

// Turns an embedder choice into the lines to write in .env + a flag telling
// whether a Gemini key is still required. The key (Gemini or EMBEDDING_API_KEY)
// is NEVER carried here: it is typed/pasted separately into .env (never an arg).
export function envConfigForEmbedder(key, details = {}) {
  if (key === "in-process") {
    return { lines: ["EMBEDDING_PROVIDER=in-process"], needsGeminiKey: false };
  }
  if (key === "gemini") {
    // Default provider (selectEmbedder) → nothing to write; only the key matters.
    return { lines: [], needsGeminiKey: true };
  }
  if (key === "openai-compatible") {
    return {
      lines: [
        "EMBEDDING_PROVIDER=openai-compatible",
        `EMBEDDING_BASE_URL=${details.baseURL}`,
        `EMBEDDING_MODEL_NAME=${details.model}`,
        `EMBEDDING_DIMENSION=${details.dimension}`,
      ],
      needsGeminiKey: false,
    };
  }
  if (key === "ollama") {
    // Ollama = the openai-compatible adapter pointed at the local server (ADR 0007).
    // EmbeddingGemma defaults (768); overridable (e.g. bge-m3/1024).
    return envConfigForEmbedder("openai-compatible", {
      baseURL: details.baseURL ?? "http://localhost:11434/v1",
      model: details.model ?? "embeddinggemma",
      dimension: details.dimension ?? 768,
    });
  }
  throw new Error(`Unknown embedder choice: ${key}`);
}

// Is the embedder described by this .env ready to index? Gemini → the key is needed;
// in-process → always (weights pulled on first use); openai-compatible → at least a
// base URL is needed (the key may be empty for local/Ollama). Used by the installer
// to launch (or defer) the initial indexing and the post-flight without depending on
// the Gemini key alone.
export function embedderReady(envContent) {
  if (geminiKeyRequired(envContent)) return hasGeminiKey(envContent);
  const provider = /^EMBEDDING_PROVIDER=(.+)$/m.exec(envContent ?? "")?.[1]?.trim();
  if (provider === "in-process") return true;
  return /^EMBEDDING_BASE_URL=.+/m.test(envContent ?? "");
}
