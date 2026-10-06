"use client";

/* Recall trace: shows the 4 parallel arms, RRF fusion, reranking,
   boosts and token-budget packing — the transparency view from the
   retrieval walkthrough. */

import { useState } from "react";
import type { RecallTrace as Trace } from "@/lib/types";
import { Badge, Card, Progress } from "@/components/ui";
import { cn, fmtMs, NETWORK_META } from "@/lib/utils";
import { ArrowDown, Check, Filter, X } from "lucide-react";

const ARM_META = {
  semantic: { label: "Semantic", color: "var(--world)", hint: "cosine over embeddings" },
  bm25: { label: "Keyword · BM25", color: "var(--experience)", hint: "lexical exact terms" },
  graph: { label: "Graph", color: "var(--observation)", hint: "spreading activation" },
  temporal: { label: "Temporal", color: "var(--opinion)", hint: "window overlap + spread" },
} as const;

export function RecallTraceView({ trace }: { trace: Trace }) {
  const [showAll, setShowAll] = useState(false);
  const idToText = new Map(trace.candidates.map((c) => [c.fact.id, c.fact.text]));

  const rows = showAll ? trace.candidates : trace.candidates.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* header stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { l: "Latency", v: fmtMs(trace.latencyMs) },
          { l: "Recall budget", v: String(trace.recallBudget) },
          { l: "Candidates", v: String(trace.candidates.length) },
          { l: "Selected", v: `${trace.selected.length}` },
          { l: "Tokens packed", v: `${trace.tokensUsed}/${trace.maxTokens}` },
        ].map((x) => (
          <div key={x.l} className="rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-faint">{x.l}</p>
            <p className="text-sm font-mono text-ink mt-0.5 tabular-nums">{x.v}</p>
          </div>
        ))}
      </div>

      {trace.window && (
        <div className="flex items-center gap-2 text-xs text-muted rounded-lg border border-accent-border/40 bg-accent-soft px-3 py-2">
          <Filter size={13} className="text-accent" />
          Temporal channel active — parsed “{trace.window.label}” into{" "}
          <span className="font-mono text-ink">
            {new Date(trace.window.start).toLocaleDateString()} → {new Date(trace.window.end).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* four arms */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {(Object.keys(ARM_META) as (keyof typeof ARM_META)[]).map((arm) => {
          const hits = trace.arms[arm];
          const meta = ARM_META[arm];
          return (
            <Card key={arm} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: meta.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <span className="text-[10px] font-mono text-faint">{hits.length} hits</span>
              </div>
              <p className="text-[10px] text-faint mb-2">{meta.hint}</p>
              <div className="space-y-1">
                {hits.slice(0, 4).map((h) => (
                  <div key={h.factId} className="flex items-center gap-1.5 text-[10.5px]">
                    <span className="font-mono text-faint w-4 shrink-0">#{h.rank}</span>
                    <span className="text-muted truncate flex-1" title={idToText.get(h.factId)}>
                      {(idToText.get(h.factId) ?? h.factId).slice(0, 44)}
                    </span>
                    <span className="font-mono text-faint shrink-0">{h.score.toFixed(2)}</span>
                  </div>
                ))}
                {!hits.length && <p className="text-[10px] text-faint italic">no hits</p>}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center text-faint">
        <div className="flex flex-col items-center gap-0.5">
          <ArrowDown size={14} className="anim-pulse-soft" />
          <span className="chip">RRF: Σ 1/(k + rank) → cross-encoder → boosts</span>
          <ArrowDown size={14} className="anim-pulse-soft" />
        </div>
      </div>

      {/* fused ranking table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left text-faint border-b border-border-soft bg-surface-2">
                <th className="px-3 py-2 font-medium w-8">#</th>
                <th className="px-2 py-2 font-medium">Memory</th>
                <th className="px-2 py-2 font-medium w-24">Arms found</th>
                <th className="px-2 py-2 font-medium w-16 text-right">RRF</th>
                <th className="px-2 py-2 font-medium w-16 text-right">CE</th>
                <th className="px-2 py-2 font-medium w-24 text-right">Boosts</th>
                <th className="px-2 py-2 font-medium w-16 text-right">Final</th>
                <th className="px-2 py-2 font-medium w-14 text-right">Tokens</th>
                <th className="px-3 py-2 font-medium w-16 text-center">Packed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.fact.id}
                  className={cn(
                    "border-b border-border-soft/60 transition-colors hover:bg-surface-2",
                    !c.included && "opacity-45"
                  )}
                >
                  <td className="px-3 py-2 font-mono text-faint">{i + 1}</td>
                  <td className="px-2 py-2 max-w-[340px]">
                    <div className="flex items-center gap-1.5">
                      <Badge color={NETWORK_META[c.fact.network].color} className="shrink-0">
                        {NETWORK_META[c.fact.network].label}
                      </Badge>
                      <span className="text-ink truncate" title={c.fact.text}>
                        {c.fact.text.slice(0, 72)}
                        {c.fact.text.length > 72 ? "…" : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      {(Object.keys(ARM_META) as (keyof typeof ARM_META)[]).map((arm) => (
                        <span
                          key={arm}
                          title={`${ARM_META[arm].label}: ${c.arms[arm] ? `rank #${c.arms[arm]}` : "miss"}`}
                          className={cn("w-4 h-4 rounded grid place-items-center text-[9px] font-bold border")}
                          style={
                            c.arms[arm]
                              ? { color: ARM_META[arm].color, borderColor: ARM_META[arm].color, background: `color-mix(in srgb, ${ARM_META[arm].color} 14%, transparent)` }
                              : { color: "var(--faint)", borderColor: "var(--border)", opacity: 0.4 }
                          }
                        >
                          {c.arms[arm] ?? "·"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-muted">{c.rrf.toFixed(4)}</td>
                  <td className="px-2 py-2 text-right font-mono text-muted">{c.rerank.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right font-mono text-faint" title={`recency ×${c.recencyBoost.toFixed(2)} · temporal ×${c.temporalBoost.toFixed(2)} · proof ×${c.proofBoost.toFixed(2)} · entity ×${(c.entityBoost ?? 1).toFixed(2)}`}>
                    ×{((c.recencyBoost * c.temporalBoost * c.proofBoost) * (c.entityBoost ?? 1)).toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-accent font-semibold">{c.finalScore.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right font-mono text-muted">{c.tokens}</td>
                  <td className="px-3 py-2 text-center">
                    {c.included ? (
                      <Check size={13} className="text-ok inline" />
                    ) : (
                      <X size={13} className="text-faint inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2.5 border-t border-border-soft flex items-center gap-3">
          <div className="flex-1">
            <Progress value={trace.tokensUsed} max={trace.maxTokens} />
          </div>
          <span className="text-[11px] font-mono text-muted shrink-0 tabular-nums">
            {trace.tokensUsed} / {trace.maxTokens} tokens
          </span>
          {trace.candidates.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-[11px] text-accent hover:underline shrink-0">
              {showAll ? "Show top 8" : `Show all ${trace.candidates.length}`}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
