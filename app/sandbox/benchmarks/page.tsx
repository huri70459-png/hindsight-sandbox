"use client";

/* Benchmarks — every dataset from the reviewed papers:
   headline retrieval accuracy, LongMemEval, LoCoMo, Ledger-QA
   horizons, UMA averages, and the ten-system cost/energy study. */

import { useMemo, useState } from "react";
import { BarChart3, ExternalLink, FlaskConical, Trophy, Zap } from "lucide-react";
import { Badge, Card, CardHeader, Tabs } from "@/components/ui";
import { HBarChart, LineChart, Scatter, VBars } from "@/components/charts";
import {
  benchmarkSources, codingAgents, frontier, ledgerHorizons, ledgerQA, locomoCategories,
  locomoRows, longMemEvalCategories, longMemEvalRows, siteBenchmarks, systemsStudy, umaMain,
  type BenchmarkRow,
} from "@/lib/data/benchmarks";
import { cn } from "@/lib/utils";

type Tab = "headline" | "longmemeval" | "locomo" | "ledger" | "systems";

export default function BenchmarksPage() {
  const [tab, setTab] = useState<Tab>("headline");
  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Card className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Trophy size={15} className="text-accent" /> Benchmark explorer
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Published results from the reviewed papers — this sandbox displays and cross-filters them; it does not re-run evaluations.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {benchmarkSources.map((src) => (
            <a key={src.id} href={src.href} target="_blank" rel="noreferrer" className="chip hover:border-accent-border hover:text-accent transition-colors">
              {src.label} <ExternalLink size={9} className="inline" />
            </a>
          ))}
        </div>
      </Card>

      <Tabs
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "headline", label: "Headline accuracy" },
          { id: "longmemeval", label: "LongMemEval" },
          { id: "locomo", label: "LoCoMo" },
          { id: "ledger", label: "Ledger-QA horizons" },
          { id: "systems", label: "Systems study" },
        ]}
      />

      {tab === "headline" && <HeadlineTab />}
      {tab === "longmemeval" && <MatrixTab title="LongMemEval (S setting, 500 questions)" note="Judge: GPT-OSS-120B at temperature 0. Hindsight (OSS-20B) lifts the same-backbone full-context baseline from 39.0 → 83.6." rows={longMemEvalRows} categories={[...longMemEvalCategories]} />}
      {tab === "locomo" && <MatrixTab title="LoCoMo — very long-term conversational memory" note="50 human–human conversations, up to 35 sessions each. Baseline numbers as claimed by the Backboard report; Hindsight judged consistently with GPT-OSS-120B." rows={locomoRows} categories={[...locomoCategories]} />}
      {tab === "ledger" && <LedgerTab />}
      {tab === "systems" && <SystemsTab />}
    </div>
  );
}

/* ============ headline ============ */

function HeadlineTab() {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader title="Retrieval accuracy — vs. next best published system" subtitle="as listed on hindsight.vectorize.io" icon={<BarChart3 size={15} />} />
        <HBarChart
          items={siteBenchmarks.map((b) => ({
            label: b.name,
            value: b.hindsight,
            value2: b.nextBest ?? undefined,
            highlight: true,
          }))}
          max={100}
          unit="%"
          legend={["Hindsight", "Next best system"]}
        />
        <div className="mt-4 rounded-lg border border-border-soft bg-bg-soft p-3 text-[11px] text-faint leading-relaxed">
          With a 20B open backbone, the architecture alone beats full-context GPT-4o on LongMemEval (83.6 vs 60.2) —
          the biggest lifts land exactly where long horizons hurt: multi-session 21.1 → 79.7 and temporal 31.6 → 79.7.
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Coding agents — corrections vs cost" subtitle="61-task SDE-style suite, mean of 3 runs" icon={<Zap size={15} />} />
          <Scatter
            points={codingAgents.map((c) => ({ x: c.costPerTask, y: c.correctionsPerTask, label: c.name, ours: c.ours, size: 8 }))}
            xLog={false}
            yLog={false}
            xLabel="Cost / task (USD) — cheaper is better ←"
            yLabel="Corrections / task — fewer is better ↑"
            xFormat={(v) => `$${v.toFixed(2)}`}
            yFormat={(v) => v.toFixed(1)}
            height={230}
          />
          <p className="text-[11px] text-faint mt-2">Every agent solves 60–61 of 61 tasks either way — memory changes what it costs to get there.</p>
        </Card>
        <Card>
          <CardHeader title="UMA — benchmark family averages" subtitle="LLM-as-judge, 16k session budget (arXiv:2602.18493)" icon={<FlaskConical size={15} />} />
          <VBars
            height={180}
            unit="%"
            groups={umaMain.map((u) => ({
              label: u.method.replace("UMA-", "UMA·").replace(" (16k)", "").replace(" (32k)", "·32k"),
              values: [
                { name: "TTL avg", value: u.ttl, color: u.ours ? "var(--accent)" : "var(--surface-3)" },
                { name: "AR avg", value: u.ar, color: u.ours ? "var(--accent-2)" : "var(--border)" },
              ],
            }))}
          />
        </Card>
      </div>
    </div>
  );
}

/* ============ sortable matrix table ============ */

function MatrixTab({ title, note, rows, categories }: { title: string; note: string; rows: BenchmarkRow[]; categories: string[] }) {
  const [sortCol, setSortCol] = useState<string | null>("Overall");

  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => (b.values[sortCol] ?? -1) - (a.values[sortCol] ?? -1));
  }, [rows, sortCol]);

  const bestPerCol = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of categories) m[c] = Math.max(...rows.map((r) => r.values[c] ?? -1));
    return m;
  }, [rows, categories]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 pb-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="text-xs text-muted mt-1 max-w-3xl leading-relaxed">{note}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[860px]">
          <thead>
            <tr className="border-y border-border-soft bg-surface-2 text-faint">
              <th className="text-left px-4 py-2 font-medium sticky left-0 bg-surface-2">System</th>
              {categories.map((c) => (
                <th key={c} className="px-2 py-2 font-medium text-right cursor-pointer hover:text-accent transition-colors whitespace-nowrap" onClick={() => setSortCol(sortCol === c ? null : c)}>
                  {c}
                  {sortCol === c && <span className="text-accent ml-1">↓</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.system} className={cn("border-b border-border-soft/60 hover:bg-surface-2 transition-colors", r.ours && "bg-accent-soft/40")}>
                <td className="px-4 py-2 sticky left-0 bg-inherit whitespace-nowrap">
                  <span className={cn("font-medium", r.ours ? "text-accent" : "text-ink")}>{r.system}</span>
                  {r.ours && <Badge color="var(--accent)" className="ml-2">ours</Badge>}
                </td>
                {categories.map((c) => {
                  const v = r.values[c];
                  const best = v !== null && v === bestPerCol[c];
                  return (
                    <td key={c} className={cn("px-2 py-2 text-right font-mono tabular-nums", best ? "text-ink font-bold" : "text-muted")}>
                      {v === null ? "—" : v.toFixed(1)}
                      {best && <span className="text-accent ml-1">●</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[10.5px] text-faint">Click any column header to sort · ● marks the best result per column.</p>
    </Card>
  );
}

/* ============ ledger-qa ============ */

function LedgerTab() {
  const [metricNote] = useState("LLM-as-a-Judge (DeepSeek-V3.2), unweighted mean across horizons");
  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
      <Card>
        <CardHeader title="Ledger-QA — judge score vs. session horizon" subtitle={metricNote} icon={<FlaskConical size={15} />} />
        <LineChart
          height={300}
          labels={ledgerHorizons.map((h) => `H=${h}`)}
          series={ledgerQA.map((m, i) => ({
            name: m.method,
            color: m.ours ? (i % 2 ? "var(--accent-2)" : "var(--accent)") : ["var(--faint)", "#7c8db5", "#9a7bb8", "#6fa8a0", "#b0876f", "#8296b8"][i % 6],
            data: m.scores,
            dashed: !m.ours,
          }))}
        />
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Why baselines collapse" subtitle="latent state, not local spans" icon={<Trophy size={15} />} />
          <div className="space-y-2 text-[12px] text-muted leading-relaxed">
            <p>
              Answers are <b className="text-ink">aggregated values</b> (totals, maxima, per-range sums) derived from
              scattered updates — no single span contains them. RAG and recurrent summarization stay competitive at H=2
              but fall to <span className="font-mono text-danger">5.8</span> and <span className="font-mono text-danger">2.9</span> at H=500.
            </p>
            <p>
              The task-adapted specialist holds <span className="font-mono text-ok">25.0</span> at H=500 — above every
              non-UMA baseline — because explicit CRUD maintenance keeps state current instead of re-reading history.
            </p>
            <p className="text-[11px] text-faint">
              An arithmetic-only control shows gains come from memory maintenance, not better math (base 25.4 vs specialist 25.1).
            </p>
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="bg-surface-2 text-faint border-b border-border-soft">
                <th className="text-left px-3 py-2 font-medium">Method</th>
                <th className="text-right px-3 py-2 font-medium">Avg judge</th>
                <th className="text-right px-3 py-2 font-medium">H=500</th>
              </tr>
            </thead>
            <tbody>
              {[...ledgerQA]
                .map((m) => ({ ...m, avg: m.scores.reduce((a, b) => a + b, 0) / m.scores.length }))
                .sort((a, b) => b.avg - a.avg)
                .map((m) => (
                  <tr key={m.method} className={cn("border-b border-border-soft/60", m.ours && "bg-accent-soft/40")}>
                    <td className={cn("px-3 py-1.5", m.ours ? "text-accent font-semibold" : "text-ink")}>{m.method}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{m.avg.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{m.scores.at(-1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

/* ============ systems study ============ */

function SystemsTab() {
  const [sortKey, setSortKey] = useState<keyof (typeof systemsStudy)[number]>("joulesPerCorrect");
  const sorted = useMemo(() => [...systemsStudy].sort((a, b) => Number(a[sortKey]) - Number(b[sortKey])), [sortKey]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <CardHeader
            title="Construction–serve–accuracy frontier"
            subtitle="no system is Pareto-optimal on all three axes (MemoryAgentBench macro-avg)"
            icon={<BarChart3 size={15} />}
          />
          <Scatter
            height={320}
            points={frontier.map((f) => ({
              x: f.buildS,
              y: f.serveS,
              label: f.system,
              size: 5 + (f.accuracy - 24) * 0.28,
              color: f.accuracy >= 47 ? "var(--accent)" : f.accuracy >= 36 ? "var(--accent-2)" : "var(--faint)",
            }))}
            xLabel="Construction wall time (s, log) — build cost"
            yLabel="Serve latency / query (s, log)"
            xFormat={(v) => (v >= 3600 ? `${(v / 3600).toFixed(0)}h` : v >= 60 ? `${(v / 60).toFixed(0)}m` : `${v.toFixed(0)}s`)}
            yFormat={(v) => `${v.toFixed(1)}s`}
          />
          <p className="text-[11px] text-faint mt-2">Bubble size ∝ accuracy (25.9–55.8%). BM25 tops the macro-average on recall-heavy suites while structure-augmented systems win on paraphrase, multi-hop and temporal families.</p>
        </Card>
        <Card>
          <CardHeader title="Energy per correct answer" subtitle="construction + 300 QA queries, Qwen3-32B on 1×H100" icon={<Zap size={15} />} />
          <HBarChart
            items={[...systemsStudy].sort((a, b) => a.joulesPerCorrect - b.joulesPerCorrect).map((r) => ({
              label: r.system,
              value: r.joulesPerCorrect / 1000,
              color: r.joulesPerCorrect < 10000 ? "var(--observation)" : r.joulesPerCorrect < 60000 ? "var(--warn)" : "var(--danger)",
            }))}
            unit=" kJ"
            max={200}
          />
          <p className="text-[11px] text-faint mt-3 leading-relaxed">
            A 45× spread — and for most LLM-mediated systems, construction energy exceeds total query-phase energy.
            Accuracy alone is an insufficient selection criterion.
          </p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 pb-3 flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink">Ten-system characterization</h3>
            <p className="text-xs text-muted mt-0.5">LongMemEval_S_* (5 samples · 1.8M tokens of history · 300 queries) — arXiv:2606.06448, Table 3</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
            sort by
            {(["accuracy", "totalKJ", "joulesPerCorrect", "calls"] as const).map((k) => (
              <button key={k} onClick={() => setSortKey(k)} className={cn("chip cursor-pointer", sortKey === k && "border-accent-border text-accent bg-accent-soft")}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[760px]">
            <thead>
              <tr className="border-y border-border-soft bg-surface-2 text-faint">
                {["System", "Paradigm", "Acc %", "Wall time", "Calls", "Total kJ", "J / correct"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-2 font-medium", i > 1 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.system} className="border-b border-border-soft/60 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 font-medium text-ink">{r.system}</td>
                  <td className="px-4 py-2"><Badge>{r.paradigm}</Badge></td>
                  <td className="px-4 py-2 text-right font-mono text-muted">{r.accuracy.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">{r.wallTime}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">{r.calls.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">{r.totalKJ.toLocaleString()}</td>
                  <td className={cn("px-4 py-2 text-right font-mono", r.joulesPerCorrect < 10000 ? "text-ok" : r.joulesPerCorrect < 60000 ? "text-warn" : "text-danger")}>
                    {(r.joulesPerCorrect / 1000).toFixed(1)} kJ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
