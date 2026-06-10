// ─────────────────────────────────────────────────────────────────────────────
// eval-judge.mjs — PURE core of the RAG eval-set (Step 2 of the embedder plan).
// The judge is Claude (`claude -p`, as a subprocess on the orchestrator side); here
// we only do the deterministic, testable part: build the prompt, read its verdict,
// aggregate into a reproducible numeric score. No I/O.
// ─────────────────────────────────────────────────────────────────────────────

// Reads the verdict returned by the judge. Contract: the judge ends with a line
// `VERDICT: PASS` (the returned passages make it possible to answer) or `VERDICT: FAIL`.
export function parseVerdict(output) {
  if (/VERDICT:\s*PASS/i.test(output)) return { pass: true };
  if (/VERDICT:\s*FAIL/i.test(output)) return { pass: false };
  return { pass: false, unreadable: true };
}

// Aggregates the verdicts of an eval pass into a reproducible numeric score.
export function scoreEval(results) {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const unreadable = results.filter((r) => r.unreadable).length;
  return { passed, total, unreadable, score: total === 0 ? 0 : passed / total };
}

// Builds the judge's prompt (Claude): the question, the expected answer, the passages
// actually returned by search_vault, and the verdict instruction.
export function buildJudgePrompt(item, retrievedText) {
  return [
    "You are a RAG evaluation judge. A question was put to a semantic search engine",
    "over a vault of notes; here is the EXPECTED answer and the passages it actually",
    "returned. Judge ONLY whether these passages contain the information needed to",
    "answer correctly (regardless of wording).",
    "Do not rely on your own knowledge: only the passages count.",
    "",
    `Question: ${item.question}`,
    `Expected answer: ${item.expect}`,
    "",
    "Returned passages:",
    retrievedText,
    "",
    "End your reply with a line EXACTLY in the following format:",
    "VERDICT: PASS  (if the passages are enough to answer)",
    "VERDICT: FAIL  (if they are not enough)",
  ].join("\n");
}
