/* ============================================================
   Entity store — canonical entities as first-class records built
   from the memory graph: degree, network mix, co-occurrence
   neighbors, and the query-time boost signal they power.
   ============================================================ */

import type { MemoryFact, Network } from "@/lib/types";
import { embed } from "./nlp";

export interface EntityRecord {
  name: string;
  factIds: string[];
  degree: number;
  networks: Partial<Record<Network, number>>;
  cooccur: { entity: string; count: number }[];
  firstSeen: string;
  lastSeen: string;
}

export function buildEntityIndex(facts: MemoryFact[]): EntityRecord[] {
  const byName = new Map<string, MemoryFact[]>();
  for (const f of facts) {
    for (const e of f.entities) {
      const key = canonical(e);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(f);
    }
  }

  const records: EntityRecord[] = [];
  for (const [name, fs] of byName) {
    const cooc = new Map<string, number>();
    const networks: Partial<Record<Network, number>> = {};
    for (const f of fs) {
      networks[f.network] = (networks[f.network] ?? 0) + 1;
      for (const other of f.entities) {
        const k = canonical(other);
        if (k === name) continue;
        cooc.set(k, (cooc.get(k) ?? 0) + 1);
      }
    }
    const times = fs.map((f) => new Date(f.mentionedAt).getTime());
    records.push({
      name,
      factIds: [...new Set(fs.map((f) => f.id))],
      degree: fs.length,
      networks,
      cooccur: [...cooc.entries()]
        .map(([entity, count]) => ({ entity, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      firstSeen: new Date(Math.min(...times)).toISOString(),
      lastSeen: new Date(Math.max(...times)).toISOString(),
    });
  }
  return records.sort((a, b) => b.degree - a.degree);
}

/** the tanh-saturated signal used by the entity-overlap retrieval boost */
export function entityBoostSignal(sharedCount: number): number {
  return Math.tanh(sharedCount * 0.5);
}

export function entityEmbedding(name: string): Float32Array {
  return embed(name);
}

function canonical(e: string): string {
  return e
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^the\s+/i, "");
}
