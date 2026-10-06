/* ============================================================
   CARA-style reflect (simulated): disposition verbalization,
   preference-conditioned answer synthesis over recalled
   memories, opinion formation + reinforcement, background
   merging with conflict resolution.
   ============================================================ */

import type { Bank, Disposition, MemoryFact, Opinion, RecallCandidate, RecallSettings, ReflectResult } from "@/lib/types";
import { uid } from "@/lib/utils";
import { recall, type RecallInput } from "./recall";

/** φ(Θ) — verbalize the numeric behavioral profile into natural language */
export function verbalizeDisposition(d: Disposition, bias: number): string {
  const level = (v: number) => (v <= 2 ? "low" : v >= 4 ? "high" : "moderate");
  const parts: string[] = [];
  parts.push(
    level(d.skepticism) === "high"
      ? "You are skeptical: weigh evidence carefully, flag unsupported claims, and avoid accepting statements at face value."
      : level(d.skepticism) === "low"
        ? "You are trusting: accept user statements readily and explore generously."
        : "You are moderately skeptical: sanity-check claims but stay open."
  );
  parts.push(
    level(d.literalism) === "high"
      ? "You interpret language literally: follow exact wording and explicit instructions closely."
      : level(d.literalism) === "low"
        ? "You interpret language flexibly: read between the lines and infer implicit goals."
        : "You balance literal wording with inferred intent."
  );
  parts.push(
    level(d.empathy) === "high"
      ? "You are highly empathetic: acknowledge feelings and use supportive, face-saving language."
      : level(d.empathy) === "low"
        ? "You are detached: communicate bluntly and put the task first."
        : "You are moderately empathetic: acknowledge context without over-indexing on emotion."
  );
  const biasNote =
    bias < 0.25
      ? "Keep responses primarily fact-based; let the behavioral profile barely show."
      : bias > 0.7
        ? "Let your configured disposition strongly shape tone and conclusions — take clear stances."
        : "Balance factual neutrality with your configured behavioral style.";
  return [...parts, biasNote].join(" ");
}

export function buildSystemPrompt(bank: Bank, verbalization: string, memories: RecallCandidate[]): string {
  const directives = bank.directives
    .filter((d) => d.active)
    .sort((a, b) => b.priority - a.priority)
    .map((d) => `- [P${d.priority}] ${d.content}`);
  const memBlock = memories
    .slice(0, 8)
    .map((m, i) => `${i + 1}. (${m.fact.network}) ${m.fact.text}`)
    .join("\n");
  return [
    `You are ${bank.name}.`,
    bank.background ? `Background: ${bank.background}` : "",
    `Behavioral profile: ${verbalization}`,
    directives.length ? `Hard directives (always obey):\n${directives.join("\n")}` : "",
    `Relevant memories:\n${memBlock || "(none recalled)"}`,
    `Answer using ONLY the memories above. Separate what you know (facts/observations) from what you believe (opinions). Cite memory numbers.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SUBJECTIVE = /\b(should|best|better|prefer|recommend|opinion|think|feel|worth|favorite|advice)\b/i;

function stancePrefix(d: Disposition, bias: number): string {
  if (bias < 0.25) return "Based on the recalled memories";
  if (d.skepticism >= 4) return "With healthy skepticism toward thin evidence";
  if (d.empathy >= 4) return "Understanding where you're coming from";
  if (d.literalism >= 4) return "Strictly per what was recorded";
  return "Weighing the evidence";
}

/** synthesize a grounded answer (template-based stand-in for the backbone LLM) */
export function reflect(input: RecallInput & { bank: Bank; facts: MemoryFact[]; opinions: Opinion[] }): ReflectResult {
  const trace = recall(input);
  const verbalization = verbalizeDisposition(input.bank.disposition, input.bank.bias);
  const systemPrompt = buildSystemPrompt(input.bank, verbalization, trace.selected);

  const memories = trace.selected;
  const citations = memories.slice(0, 4).map((m, i) => `[${i + 1}]`);
  const evidenceText = memories
    .slice(0, 3)
    .map((m) => m.fact.text)
    .join("; ");

  let response: string;
  if (!memories.length) {
    response = `I don't have enough information in this bank to answer "${input.query}" confidently. Nothing relevant was recalled within the token budget — try retaining more context or raising max_tokens.`;
  } else if (SUBJECTIVE.test(input.query)) {
    const conf = input.bank.disposition.skepticism >= 4 ? "tentatively" : "clearly";
    response = `${stancePrefix(input.bank.disposition, input.bank.bias)}, I ${conf} conclude: ${evidenceText}. ${
      citations.length ? `Grounded in memories ${citations.join(" ")}.` : ""
    }`;
  } else {
    response = `${stancePrefix(input.bank.disposition, input.bank.bias)}: ${evidenceText}. ${
      citations.length ? `Sources: ${citations.join(" ")}.` : ""
    }`;
  }

  // opinion formation on subjective queries
  const newOpinions: { text: string; confidence: number; reasoning: string }[] = [];
  if (SUBJECTIVE.test(input.query) && memories.length) {
    const base = 0.5 + Math.min(0.3, memories.length * 0.07);
    const biasMod = (input.bank.bias - 0.5) * 0.15;
    const skepticismMod = (3 - input.bank.disposition.skepticism) * 0.04;
    const confidence = Math.min(0.95, Math.max(0.25, base + biasMod + skepticismMod));
    newOpinions.push({
      text: `I believe ${shorten(input.query)} → grounded answer: ${shorten(memories[0].fact.text, 90)}`,
      confidence: Number(confidence.toFixed(2)),
      reasoning: `Formed during reflect from ${memories.length} recalled memories under disposition S=${input.bank.disposition.skepticism}, L=${input.bank.disposition.literalism}, E=${input.bank.disposition.empathy}, β=${input.bank.bias}.`,
    });
  }

  return { response, systemPrompt, verbalization, memories, newOpinions, trace };
}

function shorten(s: string, n = 120): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** opinion reinforcement update rule: c′ per assess ∈ {reinforce, weaken, contradict, neutral} */
export function reinforceOpinion(
  opinion: Opinion,
  assessment: "reinforce" | "weaken" | "contradict" | "neutral",
  alpha = 0.1,
  note?: string
): Opinion {
  let c = opinion.confidence;
  if (assessment === "reinforce") c = Math.min(1, c + alpha);
  if (assessment === "weaken") c = Math.max(0, c - alpha);
  if (assessment === "contradict") c = Math.max(0, c - 2 * alpha);
  return {
    ...opinion,
    confidence: Number(c.toFixed(3)),
    history: [
      ...opinion.history,
      { at: new Date().toISOString(), confidence: Number(c.toFixed(3)), event: assessment === "neutral" ? "refined" : assessment === "reinforce" ? "reinforced" : assessment === "weaken" ? "weakened" : "contradicted", note },
    ],
  };
}

/** background merging of bank background h′ = MergeLLM(h, hnew) — rule-based simulation */
export function mergeBackground(current: string, snippet: string): { merged: string; conflict: boolean } {
  const norm = snippet.replace(/\byou (are|were|have|work)\b/gi, (_, v) => `I ${v === "are" ? "am" : v}`).trim();
  // naive conflict detection: same attribute verb, different object
  const attr = (s: string) => {
    const m = s.match(/\b(born in|works? at|work at|live[s]? in|based in)\s+([A-Za-z ]+)/i);
    return m ? { key: m[1].toLowerCase(), val: m[2].trim() } : null;
  };
  const a = attr(current);
  const b = attr(norm);
  if (a && b && a.key === b.key && a.val.toLowerCase() !== b.val.toLowerCase()) {
    const merged = current.replace(new RegExp(`(${a.key}\\s+)${escapeRe(a.val)}`, "i"), `$1${b.val}`);
    return { merged: merged + (norm.replace(b.val, "").trim() ? "" : ""), conflict: true };
  }
  const merged = [current.trim(), norm].filter(Boolean).join(" ");
  return { merged: merged.length > 320 ? merged.slice(0, 320) : merged, conflict: false };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** candidate opinions related to new facts (entity overlap or embedding sim > θ) */
export function findRelatedOpinions(fact: MemoryFact, opinions: Opinion[], theta = 0.35): Opinion[] {
  return opinions.filter((o) => {
    const overlap = o.entities.some((e) => fact.entities.some((fe) => fe.toLowerCase() === e.toLowerCase()));
    if (overlap) return true;
    // cheap lexical sim
    const a = new Set(fact.text.toLowerCase().split(/\W+/));
    const b = new Set(o.text.toLowerCase().split(/\W+/));
    let hit = 0;
    for (const t of a) if (b.has(t)) hit++;
    return hit / Math.max(1, Math.min(a.size, b.size)) > theta;
  });
}

export function newOpinionId() {
  return uid("op");
}

export type { RecallSettings };
