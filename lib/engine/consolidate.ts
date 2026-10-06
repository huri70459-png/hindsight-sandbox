/* ============================================================
   Observation consolidation (simulated background worker):
   facts → deduplicated, evidence-grounded observations with
   proof counts, freshness trends, near-duplicate reconciliation,
   and scope-aware missions.
   ============================================================ */

import type { MemoryFact, Observation, ObservationTrend } from "@/lib/types";
import { uid } from "@/lib/utils";
import { embed, cosine, extractEntities, tokenize } from "./nlp";

export interface ConsolidationOptions {
  dedupThreshold: number; // default 0.97 — 1.0 disables reconciliation
  mission: string;
  now?: Date;
}

export interface ConsolidationResult {
  created: Observation[];
  updated: Observation[];
  merged: { into: string; from: string }[];
  consolidatedFactIds: string[];
  observations: Observation[];
}

const factEmbeddingCache = new Map<string, Float32Array>();
export function factEmbed(f: MemoryFact): Float32Array {
  let e = factEmbeddingCache.get(f.id);
  if (!e) {
    e = embed(f.text);
    factEmbeddingCache.set(f.id, e);
  }
  return e;
}

function trendFrom(evidenceCount: number, updatedAt: Date, now: Date): ObservationTrend {
  const ageDays = (now.getTime() - updatedAt.getTime()) / 86400000;
  if (ageDays < 1) return evidenceCount >= 3 ? "strengthening" : "new";
  if (ageDays > 30) return "weakening";
  return evidenceCount >= 4 ? "strengthening" : "stable";
}

function titleFrom(content: string): string {
  const words = content.split(/\s+/).slice(0, 9).join(" ");
  return words.length > 64 ? words.slice(0, 64) + "…" : words;
}

function primaryEntity(f: MemoryFact): string {
  if (f.entities.length) return f.entities[0];
  return "general";
}

function shorten(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function synthesize(
  entity: string,
  facts: MemoryFact[],
  existing: Observation | undefined,
  contradicts: boolean,
  mission: string
): string {
  const texts = facts.map((f) => f.text);
  const ents = [...new Set(facts.flatMap((f) => f.entities))].slice(0, 4);
  const subject = entity !== "general" ? entity : ents[0] ?? "The user";

  if (contradicts && existing) {
    const newest = texts[texts.length - 1];
    return `${subject}: previously "${shorten(existing.content, 80)}" — refined by newer evidence: ${shorten(newest, 140)}`;
  }
  if (existing) {
    const add = texts[texts.length - 1];
    return `${shorten(existing.content, 160)} Additionally: ${shorten(add, 120)}`;
  }
  const joined = texts.map((t) => shorten(t, 110)).join(" · ");
  const missionNote = mission.trim() && !/durable/i.test(mission) ? ` (mission: ${shorten(mission.trim(), 60)})` : "";
  return `${subject} — ${joined}${missionNote}`;
}

function dedupeEvidence(list: Observation["evidence"]): Observation["evidence"] {
  const seen = new Set<string>();
  return list.filter((e) => {
    if (seen.has(e.memoryId)) return false;
    seen.add(e.memoryId);
    return true;
  });
}

/** merge observations whose embeddings are ≥ threshold similar within the same scope */
function reconcileNearDuplicates(
  obs: Observation[],
  threshold: number,
  mergedLog: { into: string; from: string }[]
): Observation[] {
  if (threshold >= 1) return obs;
  const kept: Observation[] = [];
  const embs: Float32Array[] = [];
  for (const o of obs) {
    const e = embed(o.title + " " + o.content);
    let mergeTarget = -1;
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].scope.join(",") !== o.scope.join(",")) continue;
      const sim = cosine(e, embs[i]);
      if (sim >= threshold) {
        // meaningful-detail guard: differing numbers or negations stay apart
        const numA = (kept[i].content.match(/\d+/g) ?? []).join(",");
        const numB = (o.content.match(/\d+/g) ?? []).join(",");
        const negA = /\b(not|no longer|never)\b/i.test(kept[i].content);
        const negB = /\b(not|no longer|never)\b/i.test(o.content);
        if (numA !== numB || negA !== negB) continue;
        mergeTarget = i;
        break;
      }
    }
    if (mergeTarget >= 0) {
      const t = kept[mergeTarget];
      kept[mergeTarget] = {
        ...t,
        evidence: dedupeEvidence([...t.evidence, ...o.evidence]).slice(0, 12),
        proofCount: t.proofCount + o.proofCount,
        content: t.content.length >= o.content.length ? t.content : o.content,
      };
      mergedLog.push({ into: t.id, from: o.id });
    } else {
      kept.push(o);
      embs.push(e);
    }
  }
  return kept;
}

/**
 * Consolidate unconsolidated facts into observations, grouped by
 * tag scope + primary entity, refining (never overwriting) existing ones.
 */
export function consolidateBank(
  facts: MemoryFact[],
  existing: Observation[],
  consolidatedFactIds: Set<string>,
  opts: ConsolidationOptions
): ConsolidationResult {
  const now = opts.now ?? new Date();
  const created: Observation[] = [];
  const updated: Observation[] = [];
  const merged: { into: string; from: string }[] = [];

  const pending = facts.filter(
    (f) => !consolidatedFactIds.has(f.id) && (f.network === "world" || f.network === "experience")
  );

  const groups = new Map<string, MemoryFact[]>();
  for (const f of pending) {
    const scopeKey = f.tags.length ? [...f.tags].sort().join(",") : "global";
    const key = `${scopeKey}|${primaryEntity(f).toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const allObs = [...existing];

  for (const [key, groupFacts] of groups) {
    const [scopeStr, ent] = key.split("|");
    const scope = scopeStr === "global" ? [] : scopeStr.split(",");

    let target: Observation | undefined;
    for (const o of allObs) {
      if (o.scope.join(",") !== scope.join(",")) continue;
      const mentionsEntity = o.content.toLowerCase().includes(ent) || o.title.toLowerCase().includes(ent);
      if (mentionsEntity) {
        target = o;
        break;
      }
      const sim = cosine(
        embed(groupFacts.map((f) => f.text).join(" ")),
        embed(o.content)
      );
      if (sim > 0.55) {
        target = o;
        break;
      }
    }

    const evidence = groupFacts.map((f) => ({
      memoryId: f.id,
      quote: f.text.slice(0, 140),
      timestamp: f.mentionedAt,
    }));

    if (target) {
      const contradicts = groupFacts.some((f) =>
        /\b(not anymore|no longer|switched|actually|instead|changed|correction|moved away)\b/i.test(f.text)
      );
      const prev = target.content;
      const synthesized = synthesize(ent, groupFacts, target, contradicts, opts.mission);
      const refined: Observation = {
        ...target,
        content: synthesized,
        history: [...target.history, { content: prev, at: now.toISOString() }].slice(-6),
        evidence: dedupeEvidence([...target.evidence, ...evidence]).slice(0, 12),
        proofCount: target.proofCount + groupFacts.length,
        updatedAt: now.toISOString(),
        trend: trendFrom(target.proofCount + groupFacts.length, now, now),
      };
      const idx = allObs.findIndex((o) => o.id === target!.id);
      if (idx >= 0) allObs[idx] = refined;
      updated.push(refined);
    } else {
      const synthesized = synthesize(ent, groupFacts, undefined, false, opts.mission);
      const obs: Observation = {
        id: uid("obs"),
        bankId: groupFacts[0].bankId,
        title: titleFrom(synthesized),
        content: synthesized,
        evidence,
        proofCount: groupFacts.length,
        trend: trendFrom(groupFacts.length, now, now),
        scope,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        history: [],
      };
      allObs.push(obs);
      created.push(obs);
    }
  }

  const reconciled = reconcileNearDuplicates(allObs, opts.dedupThreshold, merged);

  return {
    created,
    updated,
    merged,
    consolidatedFactIds: [...consolidatedFactIds, ...pending.map((f) => f.id)],
    observations: reconciled,
  };
}

/** mark observations stale when new unconsolidated facts mention their entities */
export function markStale(observations: Observation[], facts: MemoryFact[], consolidated: Set<string>): Observation[] {
  const freshEntities = new Set(
    facts.filter((f) => !consolidated.has(f.id)).flatMap((f) => f.entities.map((e) => e.toLowerCase()))
  );
  return observations.map((o) => {
    const ents = extractEntities(o.content).map((e) => e.toLowerCase());
    const stale = ents.some((e) => freshEntities.has(e));
    return stale && o.trend !== "stale" ? { ...o, trend: "stale" as const } : o;
  });
}

/** observations derived from a deleted memory are removed; survivors reset */
export function invalidateForDeletedFact(
  observations: Observation[],
  factId: string
): { observations: Observation[]; removed: number } {
  const before = observations.length;
  const filtered = observations
    .map((o) => ({ ...o, evidence: o.evidence.filter((e) => e.memoryId !== factId) }))
    .filter((o) => o.evidence.length > 0)
    .map((o) => ({ ...o, proofCount: Math.max(1, o.evidence.length) }));
  return { observations: filtered, removed: before - filtered.length };
}

export { tokenize };
