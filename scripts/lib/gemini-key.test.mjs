import { test } from "node:test";
import assert from "node:assert/strict";
import { hasGeminiKey, geminiKeyRequired } from "./gemini-key.mjs";

test("hasGeminiKey — key filled in → true", () => {
  assert.equal(hasGeminiKey("GOOGLE_GEMINI_API_KEY=AIzaSyABC123\n"), true);
});

test("hasGeminiKey — line present but empty value → false", () => {
  assert.equal(hasGeminiKey("GOOGLE_GEMINI_API_KEY=\n"), false);
});

test("hasGeminiKey — key absent from the file → false", () => {
  assert.equal(hasGeminiKey("# nothing here\nQUERY_RESERVE=50\n"), false);
});

test("hasGeminiKey — nonexistent .env (null/undefined) → false", () => {
  assert.equal(hasGeminiKey(null), false);
  assert.equal(hasGeminiKey(undefined), false);
});

test("geminiKeyRequired — provider absent (default Gemini) → true", () => {
  assert.equal(geminiKeyRequired("QUERY_RESERVE=50\n"), true);
  assert.equal(geminiKeyRequired(null), true);
});

test("geminiKeyRequired — provider in-process → false (no Gemini key)", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=in-process\n"), false);
});

test("geminiKeyRequired — provider openai-compatible → false", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=openai-compatible\nEMBEDDING_BASE_URL=http://x\n"), false);
});

test("geminiKeyRequired — provider explicitly gemini → true", () => {
  assert.equal(geminiKeyRequired("EMBEDDING_PROVIDER=gemini\n"), true);
});
