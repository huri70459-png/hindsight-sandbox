/* ============================================================
   TEMPR-style retain pipeline (simulated), extended with
   Mem0-style operational controls:
   • entity scoping (user_id / agent_id / app_id / run_id)
   • speaker attribution on the extraction path
   • includes / excludes / custom_instructions steering
   • infer=false → verbatim storage (both ids set)
   • auto-categorization against a bank-level catalog
   plus the original narrative extraction → entity resolution →
   graph links (entity / temporal / semantic / causal).
   ============================================================ */

import type { CategoryDef, CausalRelation, GraphLink, MemoryFact, MemoryScopes, Network } from "@/lib/types";
import { countTokens, uid } from "@/lib/utils";
import { CAUSAL_CUES, detectCausal, embed, cosine, extractDateMentions, extractEntities, tokenize } from "./nlp";

const OPINION_CUES =
  /\b(i think|i believe|in my view|i feel|prefers?|prefer|love[sd]?|hate[sd]?|best|better|worse|should|opinion|favorite|favourite)\b/i;
const EXPERIENCE_CUES = /\b(^|\.\s*)(i |we )(recommended|suggested|helped|told|advised|built|created|ran|used|tried|decided|chose|picked|answered|asked|showed|sent|wrote)\b/i;

function classify(sentence: string, speaker: "user" | "assistant"): Network {
  if (speaker === "assistant" || EXPERIENCE_CUES.test(sentence)) return "experience";
  if (OPINION_CUES.test(sentence)) return "opinion";
  return "world";
}

function initialConfidence(sentence: string): number {
  let c = 0.55;
  if (/\b(strongly|definitely|absolutely|always)\b/i.test(sentence)) c += 0.2;
  if (/\b(maybe|perhaps|probably|might|sometimes)\b/i.test(sentence)) c -= 0.15;
  if (/\bbecause\b/i.test(sentence)) c += 0.1;
  return Math.min(0.95, Math.max(0.2, c));
}

/* ---------------- auto-categorization ---------------- */

export function assignCategories(text: string, catalog: CategoryDef[], maxCategories = 2, threshold = 0.24): string[] {
  if (!catalog.length) return [];
  const tEmb = embed(text);
  const tToks = new Set(tokenize(text));
  const scored = catalog.map((c) => {
    const cEmb = embed(`${c.name.replace(/_/g, " ")} ${c.description}`);
    const sem = cosine(tEmb, cEmb);
    // lexical reinforcement: category name tokens present in text
    const nameToks = tokenize(c.name.replace(/_/g, " "));
    let lex = 0;
    for (const nt of nameToks) if (tToks.has(nt)) lex += 0.14;
    const descHits = tokenize(c.description).filter((d) => d.length > 4 && tToks.has(d)).length;
    return { name: c.name, score: sem + lex + Math.min(0.18, descHits * 0.045) };
  });
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCategories)
    .map((s) => s.name);
}

/* ---------------- steering ---------------- */

function lexicalOverlap(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = tokenize(b);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit += 1;
  return hit / ta.size;
}

/** includes/excludes steering — keeps facts matching `includes`, drops facts matching `excludes` */
export function steerFacts(facts: MemoryFact[], includes?: string, excludes?: string): MemoryFact[] {
  let out = facts;
  if (includes && includes.trim()) {
    out = out.filter((f) => lexicalOverlap(includes, f.text) >= 0.3 || f.text.toLowerCase().includes(includes.toLowerCase().slice(0, 24)));
    // never steer to zero — fall back to closest match if everything was dropped
    if (!out.length && facts.length) {
      const best = facts
        .map((f) => ({ f, s: lexicalOverlap(includes, f.text) }))
        .sort((a, b) => b.s - a.s)[0];
      if (best && best.s > 0.1) out = [best.f];
    }
  }
  if (excludes && excludes.trim()) {
    out = out.filter((f) => lexicalOverlap(excludes, f.text) < 0.34);
  }
  return out;
}

/* ---------------- retain ---------------- */

export interface RetainOptions {
  bankId: string;
  speaker?: "user" | "assistant";
  tags?: string[];
  occurredAt?: Date | null;
  scopes?: Partial<Pick<MemoryScopes, "userId" | "agentId" | "appId" | "runId">>;
  metadata?: Record<string, string>;
  includes?: string;
  excludes?: string;
  customInstructions?: string;
  customCategories?: CategoryDef[]; // per-call override of the bank catalog
  bankCategories?: CategoryDef[]; // bank-level catalog
  infer?: boolean; // false → store verbatim, no extraction
}

export interface RetainResult {
  facts: MemoryFact[];
  links: GraphLink[];
  steeredOut: number; // facts dropped by includes/excludes
  verbatim: boolean;
}

function baseScopes(opts: RetainOptions, speaker: "user" | "assistant"): MemoryScopes {
  // attribution: extraction path assigns user_id OR agent_id per speaker;
  // app_id and run_id ride on every record.
  return {
    userId: speaker === "user" ? opts.scopes?.userId ?? null : null,
    agentId: speaker === "assistant" ? opts.scopes?.agentId ?? null : null,
    appId: opts.scopes?.appId ?? null,
    runId: opts.scopes?.runId ?? null,
  };
}

/** split transcript into narrative facts — coarse-grained (2–5 per exchange) */
export function extractFacts(content: string, opts: RetainOptions): { facts: MemoryFact[]; steeredOut: number; verbatim: boolean } {
  const now = new Date();
  const detected = extractDateMentions(content, now.getFullYear());
  const occurred = opts.occurredAt ? { start: opts.occurredAt, end: opts.occurredAt } : detected;
  const catalog = opts.customCategories ?? opts.bankCategories ?? [];

  const mk = (
    text: string,
    speaker: "user" | "assistant",
    network: Network,
    verbatim: boolean
  ): MemoryFact => {
    const entities = verbatim ? extractEntities(text) : extractEntities(text);
    const dates = extractDateMentions(text, now.getFullYear()) ?? occurred;
    return {
      id: uid("fact"),
      bankId: opts.bankId,
      text,
      network,
      entities,
      occurredStart: dates ? dates.start.toISOString() : now.toISOString(),
      occurredEnd: dates ? dates.end.toISOString() : now.toISOString(),
      mentionedAt: now.toISOString(),
      confidence: network === "opinion" ? initialConfidence(text) : undefined,
      tokens: countTokens(text),
      tags: opts.tags ?? [],
      accessCount: 0,
      causal: [],
      chunkRef: content.slice(0, 600),
      scopes: verbatim
        ? {
            // verbatim records carry BOTH ids (documented infer=false behavior)
            userId: opts.scopes?.userId ?? null,
            agentId: opts.scopes?.agentId ?? null,
            appId: opts.scopes?.appId ?? null,
            runId: opts.scopes?.runId ?? null,
          }
        : baseScopes(opts, speaker),
      categories: assignCategories(text, catalog),
      metadata: opts.metadata ?? {},
      history: [],
      verbatim,
    };
  };

  // ---- infer=false: store raw content exactly as provided ----
  if (opts.infer === false) {
    return { facts: [mk(content.trim(), opts.speaker ?? "user", "world", true)], steeredOut: 0, verbatim: true };
  }

  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const units: { text: string; sp: "user" | "assistant" }[] = [];
  if (lines.length > 1 && lines.some((l) => /^(user|assistant|agent)\s*:/i.test(l))) {
    for (const l of lines) {
      const m = l.match(/^(user|assistant|agent)\s*:\s*(.*)$/i);
      if (m) units.push({ text: m[2], sp: m[1].toLowerCase() === "user" ? "user" : "assistant" });
      else if (units.length) units[units.length - 1].text += " " + l;
    }
  } else {
    const speaker = opts.speaker ?? (/^(assistant|agent):/im.test(content) ? "assistant" : "user");
    const sentences = content
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 3);
    const groupSize = Math.max(1, Math.ceil(sentences.length / Math.min(5, Math.max(2, Math.ceil(sentences.length / 2)))));
    for (let i = 0; i < sentences.length; i += groupSize) {
      units.push({ text: sentences.slice(i, i + groupSize).join(" "), sp: speaker });
    }
  }

  let facts: MemoryFact[] = [];
  units.forEach((u, idx) => {
    const text = u.text.trim();
    if (!text) return;
    const network = classify(text, u.sp);
    const f = mk(text, u.sp, network, false);
    const causalCue = detectCausal(text);
    if (causalCue && idx > 0) {
      const causal: CausalRelation[] = [{ targetFactIndex: idx - 1, relationType: causalCue, strength: 0.8 }];
      f.causal = causal;
    }
    facts.push(f);
  });

  const steered = steerFacts(facts, opts.includes, opts.excludes);
  const steeredOut = facts.length - steered.length;
  facts = steered;

  // re-point causal indexes after steering (best-effort: drop dangling)
  const idSet = new Set(facts.map((f) => f.id));
  facts = facts.map((f) => ({
    ...f,
    causal: f.causal.filter((c) => {
      const target = facts[c.targetFactIndex];
      return target && idSet.has(target.id);
    }),
  }));

  return { facts, steeredOut, verbatim: false };
}

/** build the four link types over a fact set */
export function buildLinks(facts: MemoryFact[], opts?: { semanticThreshold?: number; sigmaDays?: number }): GraphLink[] {
  const theta = opts?.semanticThreshold ?? 0.42;
  const sigmaDays = opts?.sigmaDays ?? 14;
  const links: GraphLink[] = [];
  const embeddings = new Map<string, Float32Array>();
  for (const f of facts) embeddings.set(f.id, embed(f.text));

  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];
      if (a.bankId !== b.bankId) continue;

      const shared = a.entities.filter((e) =>
        b.entities.some((be) => be.toLowerCase() === e.toLowerCase())
      );
      for (const e of shared) {
        links.push({ id: uid("lnk"), source: a.id, target: b.id, type: "entity", weight: 1.0, entity: e });
      }

      const dtDays =
        Math.abs(new Date(a.mentionedAt).getTime() - new Date(b.mentionedAt).getTime()) / 86400000;
      if (dtDays < sigmaDays * 3) {
        const w = Math.exp(-dtDays / sigmaDays);
        if (w > 0.3) links.push({ id: uid("lnk"), source: a.id, target: b.id, type: "temporal", weight: w });
      }

      const sim = cosine(embeddings.get(a.id)!, embeddings.get(b.id)!);
      if (sim >= theta) {
        links.push({ id: uid("lnk"), source: a.id, target: b.id, type: "semantic", weight: sim });
      }
    }
  }

  for (const f of facts) {
    for (const c of f.causal) {
      const target = facts[c.targetFactIndex];
      if (target && target.id !== f.id) {
        links.push({
          id: uid("lnk"),
          source: f.id,
          target: target.id,
          type: "causal",
          weight: c.strength,
          causalType: c.relationType,
        });
      }
    }
  }
  return dedupeLinks(links);
}

function dedupeLinks(links: GraphLink[]): GraphLink[] {
  const seen = new Map<string, GraphLink>();
  for (const l of links) {
    const key = [l.source, l.target].sort().join("|") + "|" + l.type + "|" + (l.entity ?? "");
    const existing = seen.get(key);
    if (!existing || existing.weight < l.weight) seen.set(key, l);
  }
  return [...seen.values()];
}

export function retain(content: string, opts: RetainOptions): RetainResult {
  const { facts, steeredOut, verbatim } = extractFacts(content, opts);
  const links = buildLinks(facts);
  return { facts, links, steeredOut, verbatim };
}

/* ---------------- ADD-only mode support ---------------- */

const UPDATE_CUES =
  /\b(now|anymore|no longer|switched|changed|moved|updated|correct(ion)?|actually|instead|new (email|address|job|role|plan)|quit|left|joined)\b/i;

/**
 * In additive (ADD-only) write mode nothing is overwritten: both old and new
 * facts survive. To keep knowledge-update queries answerable, we detect the
 * older fact a new one supersedes (shared entity + update cue + lexical
 * overlap) and record the link on the new fact.
 */
export function detectSuperseded(newFact: MemoryFact, existing: MemoryFact[]): string | null {
  if (!UPDATE_CUES.test(newFact.text)) return null;
  let best: { id: string; score: number } | null = null;
  const newToks = new Set(tokenize(newFact.text));
  for (const old of existing) {
    if (old.bankId !== newFact.bankId || old.id === newFact.id) continue;
    const sharedEntity = old.entities.some((e) =>
      newFact.entities.some((ne) => ne.toLowerCase() === e.toLowerCase())
    );
    if (!sharedEntity && old.scopes?.userId !== newFact.scopes?.userId) continue;
    const oldToks = tokenize(old.text);
    let overlap = 0;
    for (const t of oldToks) if (newToks.has(t)) overlap += 1;
    const score = overlap / Math.max(1, oldToks.length) + (sharedEntity ? 0.35 : 0);
    // don't supersede something already superseded by the same fact
    if (score > 0.45 && (!best || score > best.score)) best = { id: old.id, score };
  }
  return best?.id ?? null;
}

export { CAUSAL_CUES };
