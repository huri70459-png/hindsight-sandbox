"use client";

/* Context Tuning — every recall/consolidation knob exposed by the
   docs, wired to the live engine, with presets and A/B latency preview. */

import { useMemo, useState } from "react";
import { FlaskConical, Info, Play, RotateCcw, SlidersHorizontal, Zap } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Progress, Segmented, Slider, Textarea, Toggle } from "@/components/ui";
import { recall, recallBudget } from "@/lib/engine/recall";
import { DEFAULT_RECALL_SETTINGS, useSandbox } from "@/lib/store";
import { cn, fmtMs } from "@/lib/utils";
import type { Budget } from "@/lib/types";

const PRESETS: { name: string; budget: Budget; maxTokens: number; why: string }[] = [
  { name: "Chatbot replies", budget: "low", maxTokens: 2048, why: "Fast responses, focused context" },
  { name: "Document Q&A", budget: "mid", maxTokens: 4096, why: "Balanced coverage and speed" },
  { name: "Research queries", budget: "high", maxTokens: 8192, why: "Comprehensive, multi-hop reasoning" },
  { name: "Real-time search", budget: "low", maxTokens: 2048, why: "Minimize latency" },
];

export default function ContextPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  const r = s.recallSettings;
  const [testQuery, setTestQuery] = useState("What did Alice do in March 2026?");
  const [preview, setPreview] = useState<{ latencyMs: number; selected: number; tokens: number; budget: number } | null>(null);

  const facts = useMemo(() => s.facts.filter((f) => f.bankId === s.activeBankId), [s.facts, s.activeBankId]);
  const observations = useMemo(() => s.observations.filter((o) => o.bankId === s.activeBankId), [s.observations, s.activeBankId]);

  const runPreview = () => {
    const t = recall({ query: testQuery, facts, links: s.links, observations, opinions: [], settings: r });
    setPreview({ latencyMs: t.latencyMs, selected: t.selected.length, tokens: t.tokensUsed, budget: t.recallBudget });
    s.logEvent({ app: "context", op: "recall", message: `Tuning preview: ${t.selected.length} memories, ${t.tokensUsed} tok @ ${fmtMs(t.latencyMs)}`, latencyMs: Math.round(t.latencyMs) });
    s.recordRun({ context: 1 });
  };

  if (!hydrated) return <Card><p className="text-xs text-muted p-4">Restoring state…</p></Card>;

  return (
    <div className="max-w-[1400px] mx-auto grid xl:grid-cols-[1fr_380px] gap-4">
      {/* ============ knobs ============ */}
      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader
            title="Retrieval budget & token ceiling"
            subtitle="two independent dimensions: how deeply to search vs. how much context to return"
            icon={<SlidersHorizontal size={15} />}
            right={
              <Button size="sm" variant="ghost" onClick={() => { s.resetRecallSettings(); setPreview(null); }}>
                <RotateCcw size={12} /> Defaults
              </Button>
            }
          />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted mb-1.5">Search depth (budget)</p>
                <Segmented
                  value={r.budget}
                  onChange={(v) => s.setRecallSettings({ budget: v })}
                  options={[
                    { value: "low", label: "low · fast", title: "Quick lookups" },
                    { value: "mid", label: "mid · balanced" },
                    { value: "high", label: "high · deep", title: "Multi-hop exploration" },
                  ]}
                />
              </div>
              <div>
                <p className="text-xs text-muted mb-1.5">Budget mode</p>
                <Segmented
                  value={r.budgetMode}
                  onChange={(v) => s.setRecallSettings({ budgetMode: v })}
                  options={[
                    { value: "fixed", label: "fixed (100/300/1000)" },
                    { value: "adaptive", label: "adaptive (% of max_tokens)" },
                  ]}
                />
              </div>
              <div className="rounded-lg border border-border-soft bg-surface-2 p-3 text-[11.5px] text-muted leading-relaxed">
                Effective recall budget:{" "}
                <span className="font-mono text-accent">{recallBudget(r)}</span> candidates per arm
                {r.budgetMode === "adaptive" && (
                  <span className="block text-faint mt-1 font-mono text-[10.5px]">
                    clamp(max_tokens × ratio, 20, 2000) — low 2.5% · mid 7.5% · high 25%
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <Slider
                label="max_tokens — context returned to the agent"
                min={512} max={16384} step={512}
                value={r.maxTokens}
                onChange={(v) => s.setRecallSettings({ maxTokens: v })}
                format={(v) => `${v} tok (~${Math.round(v / 512)} pages)`}
              />
              <Slider
                label="max_chunk_tokens (include_chunks)"
                min={0} max={4096} step={256}
                value={r.maxChunkTokens}
                onChange={(v) => s.setRecallSettings({ maxChunkTokens: v, includeChunks: v > 0 })}
                format={(v) => (v === 0 ? "off" : String(v))}
              />
              <Toggle
                checked={r.includeChunks}
                onChange={(v) => s.setRecallSettings({ includeChunks: v })}
                label="Include source chunks"
                description="Return raw text behind distilled facts when verbatim nuance matters."
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Fusion & reranking" subtitle="RRF smoothing, reranker cap, per-arm strategy boosts" icon={<Zap size={15} />} />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <Slider label="RRF k — smoothing constant" min={10} max={120} value={r.rrfK} onChange={(v) => s.setRecallSettings({ rrfK: v })} />
              <Slider label="Reranker max candidates (pre-filter cap)" min={50} max={1000} step={50} value={r.rerankerCap} onChange={(v) => s.setRecallSettings({ rerankerCap: v })} />
              <Toggle
                checked={r.rerankEnabled}
                onChange={(v) => s.setRecallSettings({ rerankEnabled: v })}
                label={r.rerankEnabled ? "Precision path — cross-encoder ON" : "Quick path — cross-encoder OFF"}
                description={
                  r.rerankEnabled
                    ? "Reranker reads query + memory together (+~15ms simulated). Best when only the top result reaches the user."
                    : "RRF-derived scores spread over [0.1, 1.0] by rank. Best for exploratory lists where users scan results."
                }
              />
              <p className="text-[11px] text-faint leading-relaxed flex gap-1.5">
                <Info size={12} className="shrink-0 mt-0.5" />
                Boosts promote an arm in rank space (rank ÷ divisor) before the cap and again after reranking — they never scale raw scores.
              </p>
            </div>
            <div className="space-y-3">
              {(["semantic", "bm25", "graph", "temporal"] as const).map((arm) => (
                <Slider
                  key={arm}
                  label={`Strategy boost · ${arm}`}
                  min={0} max={3} step={1}
                  value={r.boosts[arm]}
                  onChange={(v) => s.setRecallSettings({ boosts: { ...r.boosts, [arm]: v } })}
                  format={(v) => (v === 0 ? "off" : `÷${v + 1}`)}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Scoring boosts" subtitle="multiplicative, centered at 1.0 — conservative by design (max ≈ ±27%)" icon={<Zap size={15} />} />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <Slider label="Recency α (±10% max)" min={0} max={0.5} step={0.05} value={r.recencyAlpha} onChange={(v) => s.setRecallSettings({ recencyAlpha: v })} format={(v) => v.toFixed(2)} />
              <Slider label="Temporal proximity α (±10% max)" min={0} max={0.5} step={0.05} value={r.temporalAlpha} onChange={(v) => s.setRecallSettings({ temporalAlpha: v })} format={(v) => v.toFixed(2)} />
              <Slider label="Proof count α (±5% max)" min={0} max={0.2} step={0.025} value={r.proofAlpha} onChange={(v) => s.setRecallSettings({ proofAlpha: v })} format={(v) => v.toFixed(3)} />
            </div>
            <div className="space-y-4">
              <Slider
                label="Entity overlap boost α — query entities ∩ memory entities (tanh-saturated)"
                min={0} max={0.5} step={0.05}
                value={r.entityBoostAlpha}
                onChange={(v) => s.setRecallSettings({ entityBoostAlpha: v })}
                format={(v) => (v === 0 ? "off" : `±${Math.round(v * 100)}%`)}
              />
              <Toggle
                checked={r.includeExpired}
                onChange={(v) => s.setRecallSettings({ includeExpired: v })}
                label="Include expired memories in recall"
                description="Off = memories past expiration_date are skipped (retention-aware retrieval). On = audit mode."
              />
            </div>
          </div>
          <p className="text-[11px] font-mono text-faint mt-3 rounded-lg bg-surface-2 border border-border-soft p-2.5">
            final = CE × (1 + α_r(recency−0.5)) × (1 + α_t(prox−0.5)) × (1 + α_p(proof−0.5)) × entityBoost(tanh(shared×0.5))
          </p>
        </Card>

        <Card>
          <CardHeader title="Write path & consolidation" subtitle="how retained knowledge evolves — architecture choice, not just a knob" icon={<FlaskConical size={15} />} />
          <div className="mb-4 rounded-xl border border-border-soft bg-bg-soft p-3.5">
            <p className="text-xs text-muted mb-2">
              Bank write mode — <b className="text-ink">{s.banks.find((b) => b.id === s.activeBankId)?.name}</b>
            </p>
            <Segmented
              value={s.banks.find((b) => b.id === s.activeBankId)?.writeMode ?? "consolidate"}
              onChange={(v) => s.updateBank(s.activeBankId, { writeMode: v })}
              options={[
                { value: "consolidate", label: "Consolidating (Hindsight-style)" },
                { value: "additive", label: "ADD-only (Mem0-style)" },
              ]}
            />
            <p className="text-[11px] text-faint mt-2 leading-relaxed">
              {(s.banks.find((b) => b.id === s.activeBankId)?.writeMode ?? "consolidate") === "consolidate" ? (
                <>
                  <b className="text-muted">Consolidating:</b> facts feed observations (refined, never duplicated),
                  contradicting evidence erodes opinion confidence, background merges. Best for durable beliefs and
                  epistemic clarity — at the cost of write-path LLM work.
                </>
              ) : (
                <>
                  <b className="text-muted">ADD-only:</b> nothing is overwritten or consolidated — old and new facts
                  coexist, new facts get a <code className="chip">supersedes</code> link when they update an older one,
                  and the temporal channel resolves recency at query time. Fastest writes, zero information loss;
                  knowledge-update questions rely on retrieval ordering instead of state rewriting.
                </>
              )}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <Toggle
                checked={r.autoConsolidation}
                onChange={(v) => s.setRecallSettings({ autoConsolidation: v })}
                label="Auto-consolidation"
                description={r.autoConsolidation ? "Runs after every retain — low-latency writes, gradual quality." : "Disabled — call consolidate manually (batch retains first)."}
              />
              <Slider
                label="Near-duplicate dedup threshold (cosine)"
                min={0.85} max={1} step={0.01}
                value={r.dedupThreshold}
                onChange={(v) => s.setRecallSettings({ dedupThreshold: v })}
                format={(v) => (v >= 1 ? "1.00 (disabled)" : v.toFixed(2))}
              />
              <div>
                <p className="text-xs text-muted mb-1.5">Network types included in recall</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["world", "experience", "observation", "opinion"] as const).map((n) => {
                    const on = r.types.length === 0 || r.types.includes(n);
                    return (
                      <button
                        key={n}
                        onClick={() => {
                          const base = r.types.length === 0 ? (["world", "experience", "observation", "opinion"] as const).filter((x) => x !== n) : r.types.includes(n) ? r.types.filter((x) => x !== n) : [...r.types, n];
                          s.setRecallSettings({ types: base.length === 4 ? [] : [...base] });
                        }}
                        className={cn("chip cursor-pointer transition-all", on ? "border-accent-border text-accent bg-accent-soft" : "opacity-40")}
                      >
                        {n}
                      </button>
                    );
                  })}
                  {r.types.length > 0 && (
                    <button className="chip cursor-pointer text-faint" onClick={() => s.setRecallSettings({ types: [] })}>
                      clear = all
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted mb-1.5">observations_mission</p>
                <Textarea
                  rows={4}
                  value={r.observationsMission}
                  onChange={(e) => s.setRecallSettings({ observationsMission: e.target.value })}
                  placeholder="Leave blank for the default: durable facts — preferences, skills, relationships, recurring patterns. Ephemeral state filtered out."
                  className="text-[11.5px] font-mono"
                />
              </div>
              <div>
                <p className="text-xs text-muted mb-1.5">consolidation_strategies (JSON — first match wins per scope)</p>
                <Textarea
                  rows={5}
                  value={r.consolidationStrategies}
                  onChange={(e) => s.setRecallSettings({ consolidationStrategies: e.target.value })}
                  className="text-[11px] font-mono"
                  placeholder='[{"scopes":[{"tags":["company:*"]}],"observations_mission":"General trends only."}]'
                />
                <StrategyValidation json={r.consolidationStrategies} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ============ live preview ============ */}
      <div className="space-y-4">
        <Card className="sticky top-20">
          <CardHeader title="Live pipeline preview" subtitle="runs recall against the active bank with current settings" icon={<Play size={15} />} />
          <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} className="text-xs mb-3" placeholder="Test query…" />
          <Button variant="primary" className="w-full" onClick={runPreview}>
            <Play size={13} /> Run with these settings
          </Button>

          {preview && (
            <div className="mt-4 space-y-3 anim-fade-up">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Latency", v: fmtMs(preview.latencyMs), c: "var(--accent)" },
                  { l: "Memories", v: String(preview.selected), c: "var(--observation)" },
                  { l: "Tokens packed", v: `${preview.tokens}`, c: "var(--world)" },
                  { l: "Recall budget", v: String(preview.budget), c: "var(--opinion)" },
                ].map((x) => (
                  <div key={x.l} className="rounded-lg border border-border-soft bg-surface-2 p-2.5 text-center">
                    <p className="text-base font-bold font-mono tabular-nums" style={{ color: x.c }}>{x.v}</p>
                    <p className="text-[9.5px] uppercase tracking-wider text-faint">{x.l}</p>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-[10.5px] text-faint mb-1">
                  <span>budget fill</span>
                  <span className="font-mono">{preview.tokens}/{r.maxTokens}</span>
                </div>
                <Progress value={preview.tokens} max={r.maxTokens} />
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-border-soft pt-4">
            <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-2.5">Recommended presets</p>
            <div className="space-y-1.5">
              {PRESETS.map((p) => {
                const activePreset = r.budget === p.budget && r.maxTokens === p.maxTokens;
                return (
                  <button
                    key={p.name}
                    onClick={() => { s.setRecallSettings({ budget: p.budget, maxTokens: p.maxTokens, budgetMode: "fixed" }); setPreview(null); }}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-all",
                      activePreset ? "border-accent-border bg-accent-soft" : "border-border-soft bg-surface-2 hover:border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[12px] font-medium", activePreset ? "text-accent" : "text-ink")}>{p.name}</span>
                      {activePreset && <Badge color="var(--accent)">active</Badge>}
                      <span className="ml-auto chip">{p.budget} · {p.maxTokens}</span>
                    </div>
                    <p className="text-[10.5px] text-faint mt-0.5">{p.why}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border-soft bg-bg-soft p-3 text-[10.5px] text-faint leading-relaxed">
            <span className="text-muted font-semibold">Defaults restored with </span>
            <code className="font-mono text-accent">resetRecallSettings()</code> — k=60, cap=300, α=(0.2, 0.2, 0.1), dedup 0.97. Matches published pipeline defaults.
            {JSON.stringify(DEFAULT_RECALL_SETTINGS.boosts) && ""}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StrategyValidation({ json }: { json: string }) {
  if (!json.trim()) return null;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    for (const strat of parsed) {
      if (!strat.scopes || !Array.isArray(strat.scopes)) throw new Error("strategy missing scopes[]");
    }
    return <p className="text-[10.5px] text-ok mt-1.5">✓ valid — {parsed.length} strategy rule(s), first match wins per scope</p>;
  } catch (e) {
    return <p className="text-[10.5px] text-danger mt-1.5">✗ invalid JSON: {(e as Error).message} — ignored until fixed (saved as you type)</p>;
  }
}
