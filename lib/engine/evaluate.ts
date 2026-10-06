/* ============================================================
   Evaluation runner — replays the documented structure of a
   memory benchmark client-side: per-question recall at multiple
   top-k cutoffs, a deterministic judge (gold-token overlap as a
   stand-in for LLM-as-judge), token-efficiency accounting, and
   structured results in the published result format.
   ============================================================ */

import type {
  EvalQuestion,
  EvalQuestionResult,
  EvalRun,
  GraphLink,
  MemoryFact,
  Observation,
  Opinion,
  RecallSettings,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { recall } from "./recall";
import { tokenize } from "./nlp";

export interface EvalInput {
  questions: EvalQuestion[];
  facts: MemoryFact[];
  links: GraphLink[];
  observations: Observation[];
  opinions: Opinion[];
  settings: RecallSettings;
  runName: string;
  bankId: string;
}

const CUTOFFS = [5, 10, 0]; // 0 = all selected

/** deterministic judge: fraction of gold-hint tokens covered by the retrieved context */
export function judge(question: EvalQuestion, retrievedText: string): { judgment: "CORRECT" | "INCORRECT"; score: number; reason: string } {
  const ctx = new Set(tokenize(retrievedText));
  let covered = 0;
  const coveredHints: string[] = [];
  const missedHints: string[] = [];
  for (const hint of question.goldHints) {
    const hintToks = tokenize(hint);
    const hit = hintToks.length > 0 && hintToks.every((t) => ctx.has(t));
    if (hit) {
      covered += 1;
      coveredHints.push(hint);
    } else {
      missedHints.push(hint);
    }
  }
  // ground-truth token recall contributes too
  const gtToks = tokenize(question.groundTruth).filter((t) => t.length > 3);
  const gtHit = gtToks.filter((t) => ctx.has(t)).length;
  const gtFrac = gtToks.length ? gtHit / gtToks.length : 0;

  const score = Number(Math.min(1, covered / Math.max(1, question.goldHints.length) * 0.7 + gtFrac * 0.3).toFixed(2));
  const judgment = score >= 0.5 ? "CORRECT" : "INCORRECT";
  const reason =
    judgment === "CORRECT"
      ? `Retrieved context covers ${covered}/${question.goldHints.length} gold hints${coveredHints.length ? ` (${coveredHints.slice(0, 2).join(", ")}…)` : ""} and ${Math.round(gtFrac * 100)}% of ground-truth tokens.`
      : `Missing evidence: ${missedHints.slice(0, 3).join(", ") || "gold hints"} — retrieval did not surface the supporting memories.`;
  return { judgment, score, reason };
}

export function runEvaluation(input: EvalInput): EvalRun {
  const t0 = performance.now();
  const results: EvalQuestionResult[] = [];
  const latencies: number[] = [];
  let tokenSum = 0;

  for (const q of input.questions) {
    const trace = recall({
      query: q.question,
      facts: input.facts,
      links: input.links,
      observations: input.observations,
      opinions: input.opinions,
      settings: input.settings,
    });
    latencies.push(trace.latencyMs);
    tokenSum += trace.tokensUsed;

    const retrievedText = trace.selected.map((c) => c.fact.text).join(" ");
    const judgment = judge(q, retrievedText);

    const cutoff_results: EvalQuestionResult["cutoff_results"] = {};
    for (const k of CUTOFFS) {
      const subset = k === 0 ? trace.selected : trace.selected.slice(0, k);
      const j = judge(q, subset.map((c) => c.fact.text).join(" "));
      cutoff_results[k === 0 ? "top_all" : `top_${k}`] = { score: j.score, judgment: j.judgment };
    }

    results.push({
      id: q.id,
      group: q.group,
      question: q.question,
      ground_truth: q.groundTruth,
      retrieval: {
        search_query: q.question,
        search_results: trace.selected.slice(0, 6).map((c) => c.fact.text),
        search_latency_ms: Number(trace.latencyMs.toFixed(1)),
        total_results: trace.candidates.length,
      },
      judgment: { ...judgment, model: "sandbox-judge-v1 (gold-token overlap)" },
      cutoff_results,
    });
  }

  const accuracyByCutoff: Record<string, number> = {};
  for (const key of ["top_5", "top_10", "top_all"]) {
    const scores: number[] = results.map((r) => (r.cutoff_results[key]?.judgment === "CORRECT" ? 1 : 0));
    const sum = scores.reduce((a: number, b: number) => a + b, 0);
    accuracyByCutoff[key] = Number(((sum / Math.max(1, scores.length)) * 100).toFixed(1));
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const wall = performance.now() - t0;

  return {
    id: uid("run"),
    at: new Date().toISOString(),
    name: input.runName,
    bankId: input.bankId,
    settingsSnapshot: {
      budget: input.settings.budget,
      maxTokens: input.settings.maxTokens,
      rerankEnabled: input.settings.rerankEnabled,
      rrfK: input.settings.rrfK,
    },
    results,
    accuracy: accuracyByCutoff["top_all"],
    accuracyByCutoff,
    meanTokens: Math.round(tokenSum / Math.max(1, results.length)),
    p50LatencyMs: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10 + Math.round(wall / Math.max(1, results.length) / 40),
  };
}
