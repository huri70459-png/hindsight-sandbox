/* ============================================================
   TEMPR-style recall pipeline (simulated):
   4-way parallel retrieval (semantic / BM25 / graph spreading
   activation / temporal) → RRF fusion → cross-encoder rerank →
   recency·temporal·proof boosts → token-budget packing.
   ============================================================ */

import type {
  ArmHit,
  FilterNode,
  GraphLink,
  MemoryFact,
  Observation,
  Opinion,
  RecallCandidate,
  RecallSettings,
  RecallTrace,
  TemporalWindow,
} from "@/lib/types";
import { clamp, rng } from "@/lib/utils";
import { bm25Score, buildBm25, crossEncoderScore, embed, cosine, extractEntities, parseTemporal } from "./nlp";
import { matchesFilters, validateFilters } from "./filters";

export interface RecallInput {
  query: string;
  facts: MemoryFact[];
  links: GraphLink[];
  observations: Observation[];
  opinions: Opinion[];
  settings: RecallSettings;
  queryTimestamp?: Date;
  filters?: FilterNode | null; // Mem0-style v2 filters applied before the arms run
}

/** how budget maps to the recall budget number (fixed & adaptive modes) */
export function recallBudget(settings: RecallSettings): number {
  if (settings.budgetMode === "adaptive") {
    const ratio = settings.budget === "low" ? 0.025 : settings.budget === "mid" ? 0.075 : 0.25;
    return Math.round(clamp(settings.maxTokens * ratio, 20, 2000));
  }
  return settings.budget === "low" ? 100 : settings.budget === "mid" ? 300 : 1000;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

export function recall(input: RecallInput): RecallTrace {
  const t0 = performance.now();
  const { query, settings } = input;
  const now = input.queryTimestamp ?? new Date();

  // pool: facts (filtered by types + v2 filters) + observations surfaced as pseudo-facts
  const filtersValid = input.filters ? validateFilters(input.filters).ok : true;
  const now0 = new Date();
  const pool: { fact: MemoryFact; observation?: Observation }[] = [];
  for (const f of input.facts) {
    if (settings.types.length && !settings.types.includes(f.network)) continue;
    // TTL: expired memories are skipped unless explicitly included
    if (!settings.includeExpired && f.expiresAt && new Date(f.expiresAt) < now0) continue;
    if (filtersValid && input.filters && !matchesFilters(f, input.filters)) continue;
    pool.push({ fact: f });
  }
  if (settings.types.length === 0 || settings.types.includes("observation")) {
    for (const o of input.observations) {
      const synthetic: MemoryFact = {
        id: o.id,
        bankId: o.bankId,
        text: `${o.title}. ${o.content}`,
        network: "observation",
        entities: [],
        occurredStart: o.createdAt,
        occurredEnd: o.updatedAt,
        mentionedAt: o.updatedAt,
        tokens: Math.ceil((o.title + o.content).length / 4),
        tags: o.scope,
        accessCount: 0,
        causal: [],
        scopes: { userId: null, agentId: null, appId: null, runId: null },
        categories: [],
        metadata: { derived: "observation" },
        history: [],
      };
      pool.push({ fact: synthetic, observation: o });
    }
  }

  const rb = Math.min(recallBudget(settings), Math.max(pool.length, 1));
  const qEmb = embed(query);
  const docEmbeds = pool.map((p) => embed(p.fact.text));
  const corpus = buildBm25(pool.map((p) => p.fact.text));

  // ---- arm 1: semantic ----
  const semScores = pool.map((_, i) => cosine(qEmb, docEmbeds[i]));
  const semantic: ArmHit[] = rankArm(semScores, pool, rb);

  // ---- arm 2: BM25 ----
  const kwScores = pool.map((_, i) => bm25Score(corpus, i, query));
  const bm25: ArmHit[] = rankArm(kwScores, pool, rb);

  // ---- arm 3: graph spreading activation ----
  const linkTypes = settings.types;
  void linkTypes;
  const graph: ArmHit[] = graphArm(input, semantic, pool, rb, settings.budget);

  // ---- arm 4: temporal ----
  const parsed = parseTemporal(query, now);
  const window: TemporalWindow | null = parsed
    ? { start: parsed.start.toISOString(), end: parsed.end.toISOString(), label: parsed.label }
    : null;
  const temporal: ArmHit[] = window ? temporalArm(pool, parsed!.start, parsed!.end, semScores, rb) : [];

  // ---- RRF fusion (rank-based, with optional strategy boosts) ----
  const k = settings.rrfK;
  const boostDivisor = (arm: keyof RecallSettings["boosts"]) => {
    const b = settings.boosts[arm];
    return b <= 0 ? 1 : 1 / (1 + b); // boost promotes the arm in rank space
  };
  const fused = new Map<string, RecallCandidate>();
  const ensure = (i: number): RecallCandidate => {
    const p = pool[i];
    let c = fused.get(p.fact.id);
    if (!c) {
      c = {
        fact: p.fact,
        observation: p.observation,
        arms: {},
        rrf: 0,
        rerank: 0,
        recencyBoost: 1,
        temporalBoost: 1,
        proofBoost: 1,
        entityBoost: 1,
        finalScore: 0,
        included: false,
        tokens: p.fact.tokens,
      };
      fused.set(p.fact.id, c);
    }
    return c;
  };
  const addArm = (arm: "semantic" | "bm25" | "graph" | "temporal", hits: ArmHit[]) => {
    const div = boostDivisor(arm);
    hits.forEach((h) => {
      const idx = pool.findIndex((p) => p.fact.id === h.factId);
      if (idx < 0) return;
      const c = ensure(idx);
      c.arms[arm] = h.rank;
      c.rrf += 1 / (k + Math.max(1, Math.round(h.rank * div)));
    });
  };
  addArm("semantic", semantic);
  addArm("bm25", bm25);
  addArm("graph", graph);
  addArm("temporal", temporal);

  // ---- reranker pre-filter cap, then cross-encoder (precision path) ----
  let candidates = [...fused.values()].sort((a, b) => b.rrf - a.rrf);
  candidates = candidates.slice(0, settings.rerankerCap);
  const reranking = settings.rerankEnabled !== false;
  if (reranking) {
    for (const c of candidates) {
      c.rerank = crossEncoderScore(query, c.fact.text);
    }
  } else {
    // no cross-encoder: synthetic scores spread across [0.1, 1.0] by RRF rank
    candidates.forEach((c, i) => {
      c.rerank = 1.0 - (i / Math.max(1, candidates.length - 1)) * 0.9;
    });
  }

  // ---- combined scoring boosts ----
  const queryEntities = extractEntities(query).map((e) => e.toLowerCase());
  const entityAlpha = settings.entityBoostAlpha ?? 0;
  for (const c of candidates) {
    const occurred = c.fact.occurredStart ? new Date(c.fact.occurredStart) : null;
    const recency = occurred ? clamp(1.0 - daysBetween(occurred, now) / 365, 0.1, 1.0) : 0.5;
    c.recencyBoost = 1 + settings.recencyAlpha * (recency - 0.5);

    // entity-overlap boost (Mem0-style entity signal): tanh-saturated shared-entity count
    if (entityAlpha > 0 && queryEntities.length) {
      const shared = c.fact.entities.filter((e) => queryEntities.includes(e.toLowerCase())).length;
      const signal = shared > 0 ? Math.tanh(shared * 0.5) : 0; // [0, ~1]
      c.entityBoost = 1 + entityAlpha * (signal - 0.5) * 2 * (shared > 0 ? 1 : 0.5);
      c.entityBoost = clamp(c.entityBoost, 1 - entityAlpha, 1 + entityAlpha);
    } else {
      c.entityBoost = 1;
    }

    if (window && occurred) {
      const ws = new Date(window.start).getTime();
      const we = new Date(window.end).getTime();
      const center = (ws + we) / 2;
      const half = Math.max(1, (we - ws) / 2);
      const prox = 1.0 - Math.min(Math.abs(occurred.getTime() - center) / half, 1.0);
      c.temporalBoost = 1 + settings.temporalAlpha * (prox - 0.5);
    } else {
      c.temporalBoost = 1;
    }

    if (c.observation) {
      const proofNorm = clamp(0.5 + Math.log(Math.max(1, c.observation.proofCount)) / 10, 0, 1);
      c.proofBoost = 1 + settings.proofAlpha * (proofNorm - 0.5);
    } else {
      c.proofBoost = 1;
    }

    c.finalScore = c.rerank * c.recencyBoost * c.temporalBoost * c.proofBoost * c.entityBoost;
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // ---- token budget packing (skip-too-long, always return top-1) ----
  let used = 0;
  const selected: RecallCandidate[] = [];
  for (const c of candidates) {
    if (used + c.tokens <= settings.maxTokens) {
      c.included = true;
      used += c.tokens;
      selected.push(c);
    } else if (selected.length === 0) {
      c.included = true;
      used += c.tokens;
      selected.push(c);
      break;
    }
  }

  const latency = performance.now() - t0;

  return {
    query,
    window,
    arms: { semantic, bm25, graph, temporal },
    candidates,
    selected,
    tokensUsed: used,
    maxTokens: settings.maxTokens,
    latencyMs: Math.max(
      3,
      latency * 6 + rb * 0.05 + (reranking ? (candidates.length > 12 ? 18 : 6) + 14 : 4)
    ), // simulated serving latency — precision path costs ~+14ms like the documented rerank overhead
    recallBudget: rb,
  };
}

function rankArm(scores: number[], pool: { fact: MemoryFact }[], budget: number): ArmHit[] {
  return scores
    .map((score, idx) => ({ score, idx }))
    .filter((s) => s.score > 0.001)
    .sort((a, b) => b.score - a.score)
    .slice(0, budget)
    .map((s, rank) => ({ factId: pool[s.idx].fact.id, rank: rank + 1, score: s.score }));
}

/** spreading activation from semantic entry points across the memory graph */
function graphArm(
  input: RecallInput,
  entry: ArmHit[],
  pool: { fact: MemoryFact }[],
  budget: number,
  depth: "low" | "mid" | "high"
): ArmHit[] {
  const idToIdx = new Map(pool.map((p, i) => [p.fact.id, i]));
  const adj = new Map<string, { to: string; w: number; type: string }[]>();
  for (const l of input.links) {
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source)!.push({ to: l.target, w: l.weight, type: l.type });
    adj.get(l.target)!.push({ to: l.source, w: l.weight, type: l.type });
  }
  const activation = new Map<string, number>();
  const delta = depth === "high" ? 0.72 : depth === "mid" ? 0.6 : 0.45;
  const multiplier: Record<string, number> = { causal: 1.4, entity: 1.25, semantic: 0.9, temporal: 0.8 };
  let frontier: { id: string; a: number }[] = entry.slice(0, 8).map((h) => ({ id: h.factId, a: h.score }));
  const hops = depth === "high" ? 3 : depth === "mid" ? 2 : 1;

  for (let step = 0; step < hops; step++) {
    const next: { id: string; a: number }[] = [];
    for (const node of frontier) {
      for (const edge of adj.get(node.id) ?? []) {
        const a = node.a * edge.w * delta * (multiplier[edge.type] ?? 1);
        if (a < 0.02) continue;
        const prev = activation.get(edge.to) ?? 0;
        if (a > prev) {
          activation.set(edge.to, a);
          next.push({ id: edge.to, a });
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  const entryIds = new Set(entry.map((e) => e.factId));
  return [...activation.entries()]
    .filter(([id]) => !entryIds.has(id) && idToIdx.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, budget)
    .map(([id, score], i) => ({ factId: id, rank: i + 1, score }));
}

/** temporal arm: overlap filter + relevance-first selection spread across buckets */
function temporalArm(
  pool: { fact: MemoryFact }[],
  start: Date,
  end: Date,
  semScores: number[],
  budget: number
): ArmHit[] {
  const inWindow = pool
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      const s = p.fact.occurredStart ? new Date(p.fact.occurredStart) : null;
      const e = p.fact.occurredEnd ? new Date(p.fact.occurredEnd) : null;
      if (!s || !e) return false;
      return s <= end && e >= start; // interval overlap
    });
  if (!inWindow.length) return [];

  // relevance-first, then spread across time buckets
  const scored = inWindow
    .map(({ p, i }) => ({ id: p.fact.id, score: semScores[i] ?? 0.01, t: new Date(p.fact.occurredStart!).getTime() }))
    .sort((a, b) => b.score - a.score);
  const span = Math.max(1, end.getTime() - start.getTime());
  const bucketCount = Math.min(8, Math.max(2, Math.ceil(scored.length / 2)));
  const buckets = new Map<number, (typeof scored)[number][]>();
  for (const s of scored) {
    const b = clamp(Math.floor(((s.t - start.getTime()) / span) * bucketCount), 0, bucketCount - 1);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(s);
  }
  const ordered: (typeof scored)[number][] = [];
  const used = new Set<string>();
  let round = 0;
  while (ordered.length < scored.length) {
    let added = false;
    for (let b = 0; b < bucketCount; b++) {
      const item = (buckets.get(b) ?? [])[round];
      if (item && !used.has(item.id)) {
        ordered.push(item);
        used.add(item.id);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return ordered.slice(0, budget).map((s, i) => ({ factId: s.id, rank: i + 1, score: s.score }));
}

/** jittered latency series for dashboards */
export function simulateLatencySeries(n: number, base: number, seed = 7): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(base * (0.72 + r() * 0.6 + Math.sin(i / 3.1) * 0.12)));
  }
  return out;
}
