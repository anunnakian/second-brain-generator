// ─────────────────────────────────────────────────────────────────────────────
// eval-run.mjs — PURE orchestration of the eval-set: for each item, search
// (search), prompt building, judging (judge = Claude), reading the verdict, then
// aggregation into a score. `search` and `judge` are INJECTED → testable without
// spawning MCP or `claude`. The run-eval.mjs executable wires the real impls.
// ─────────────────────────────────────────────────────────────────────────────
import { buildJudgePrompt, parseVerdict, scoreEval } from "./eval-judge.mjs";

export async function runEval({ items, search, judge }) {
  const found = await search(items.map((it) => it.question));

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const retrieved = found[i].text;
    const output = await judge(buildJudgePrompt(item, retrieved));
    const verdict = parseVerdict(output);
    results.push({ question: item.question, expect: item.expect, retrieved, ...verdict });
  }

  return { ...scoreEval(results), results };
}
