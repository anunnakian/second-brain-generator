// ─────────────────────────────────────────────────────────────────────────────
// eval-set.mjs — the RAG evaluation set (Step 2 of the embedder plan).
//
// Source of truth: 10 questions about the shipped EXAMPLE VAULT (Flemmr, the parody
// company that "industrializes procrastination"). Each item = a natural-language
// question + the EXPECTED answer (ground truth that good retrieval should make it
// possible to give). The judge (Claude) scores ONLY whether the passages returned by
// search_vault are enough to answer — see eval-judge.mjs.
//
// Why the example vault and not a real brain: it is INVENTED (public-safe), VERSIONED
// and REPRODUCIBLE → the Gemini baseline can be replayed by anyone. To finely
// discriminate between embedders (Step 4), we can point the same harness at a richer
// corpus. The 1st question reuses the grep-proof canary from demo.mjs (cf.
// eval-set.test.mjs) to stay anchored to the semantic proof.
//
// Deliberate mix: "easy" questions (the answer term is in the notes → they test the
// floor) and synonym-based questions (grep-resistant → they test meaning). A weak
// embedder drops out on the latter.
// ─────────────────────────────────────────────────────────────────────────────
import { DEMO_QUESTION } from "./demo.mjs";

export const EVAL_SET = [
  {
    // Grep-proof canary (cf. demo.mjs): describes the answer with synonyms, no content
    // word shared with the notes → only semantic search makes the connection.
    question: DEMO_QUESTION,
    expect: "Pélagie de Mollecuisse, with a record Do-Nothing Rate (DNR) of 98.7%.",
  },
  {
    question: "What is the only metric tracked by Flemmr's board?",
    expect: "The Do-Nothing Rate (DNR).",
  },
  {
    question: "How much did Flemmr raise in its Series A, and what for?",
    expect: "€14M, raised to produce nothing.",
  },
  {
    question: "Who runs Flemmr and what title do they hold?",
    expect: "Jean-Kévin de la Glandée, founder and Chief Inertia Officer.",
  },
  {
    question:
      "What is the annual award for the laziest person called, and what is the date of the decision that created it?",
    expect: "The Inertia Trophy, established by the decision of November 20, 2025.",
  },
  {
    question: "What personal conviction does the founder defend about work?",
    expect: 'That "value is born from rest".',
  },
  {
    question: "Which subscription offering lets you keep your hammock permanently?",
    expect: "The Hammock as a Service (HaaS).",
  },
  {
    question: "How much does Flemmr's residential idleness retreat cost?",
    expect: "€12,000 excl. tax (the residential Immobilism Seminar).",
  },
  {
    question:
      "What is left to organize and to buy in the backlog, around the trophy and the seminars?",
    expect:
      "Schedule the Inertia Trophy award ceremony, and order connected blankets for the next immobilism seminar.",
  },
  {
    question: "What is Flemmr's slogan?",
    expect: '"Do nothing. We\'ve got it covered."',
  },
];
