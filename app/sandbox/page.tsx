"use client";

/* Tier-1 dashboard: fleet KPIs, ops timeline, network mix,
   latency structure, app health, live event stream. */

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity, ArrowUpRight, BrainCircuit, Cpu, Database, Gauge, GitBranch,
  Layers, Sparkles, Workflow, Zap,
} from "lucide-react";
import { Badge, Card, CardHeader, Empty, Progress, Sparkline, Stat } from "@/components/ui";
import { Donut, HBarChart, LineChart } from "@/components/charts";
import { useSandbox } from "@/lib/store";
import { fmtMs, fmtNum, timeAgo, NETWORK_META } from "@/lib/utils";

export default function DashboardPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);

  const bankFacts = useMemo(() => s.facts.filter((f) => f.bankId === s.activeBankId), [s.facts, s.activeBankId]);

  const netMix = useMemo(() => {
    const counts = { world: 0, experience: 0, opinion: 0 };
    for (const f of bankFacts) if (f.network in counts) counts[f.network as keyof typeof counts]++;
    return [
      { label: "World", value: counts.world, color: "var(--world)" },
      { label: "Experience", value: counts.experience, color: "var(--experience)" },
      { label: "Observation", value: s.observations.filter((o) => o.bankId === s.activeBankId).length, color: "var(--observation)" },
      { label: "Opinion", value: s.opinions.filter((o) => o.bankId === s.activeBankId).length, color: "var(--opinion)" },
    ];
  }, [bankFacts, s.observations, s.opinions, s.activeBankId]);

  const opsLabels = useMemo(
    () => s.opsSeries.filter((_, i) => i % 4 === 0).map((p) => new Date(p.t).toLocaleTimeString("en-US", { hour: "numeric" })),
    [s.opsSeries]
  );

  const totalTokens = bankFacts.reduce((a, f) => a + f.tokens, 0);
  const avgConf =
    s.opinions.filter((o) => o.bankId === s.activeBankId).reduce((a, o) => a + o.confidence, 0) /
    Math.max(1, s.opinions.filter((o) => o.bankId === s.activeBankId).length);

  const latencyBars = [
    { label: "Semantic arm", value: 34, color: "var(--world)" },
    { label: "BM25 arm", value: 21, color: "var(--experience)" },
    { label: "Graph arm", value: 58, color: "var(--observation)" },
    { label: "Temporal arm", value: 12, color: "var(--opinion)" },
    { label: "RRF + rerank", value: 44, color: "var(--accent)" },
  ];

  if (!hydrated) {
    return <Empty title="Restoring sandbox state…" hint="Hydrating persisted memory from localStorage." />;
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Memories" value={fmtNum(bankFacts.length)} icon={<Database size={16} />} delta={{ value: 8.2 }} spark={[12, 14, 13, 17, 19, 18, 22, bankFacts.length]} />
        <Stat label="Observations" value={fmtNum(s.observations.filter((o) => o.bankId === s.activeBankId).length)} icon={<Layers size={16} />} delta={{ value: 3.1 }} color="var(--observation)" spark={[2, 3, 3, 4, 5, 5, 6, 7]} />
        <Stat label="Opinions" value={fmtNum(s.opinions.filter((o) => o.bankId === s.activeBankId).length)} icon={<BrainCircuit size={16} />} color="var(--opinion)" delta={{ value: -1.4 }} spark={[3, 3, 4, 4, 5, 4, 4, 3]} />
        <Stat label="Graph links" value={fmtNum(s.links.length)} icon={<GitBranch size={16} />} color="var(--experience)" spark={[20, 24, 28, 31, 36, 40, 44, s.links.length]} />
        <Stat label="Recall p50" value={fmtMs(s.metrics[0]?.p50 ?? 38)} icon={<Zap size={16} />} delta={{ value: -4.5, suffix: "%" }} spark={[46, 44, 41, 43, 39, 40, 38, 37]} />
        <Stat label="Tokens stored" value={fmtNum(totalTokens)} icon={<Cpu size={16} />} spark={[800, 950, 1100, 1250, 1400, 1600, 1750, totalTokens]} />
      </div>

      {/* ops timeline + network mix */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <Card>
          <CardHeader
            title="Operations timeline"
            subtitle="retain / recall / reflect throughput across the last 48 hours"
            icon={<Activity size={15} />}
            right={<Badge color="var(--ok)">● live</Badge>}
          />
          <LineChart
            height={210}
            labels={opsLabels}
            series={[
              { name: "recall", color: "var(--observation)", data: s.opsSeries.filter((_, i) => i % 4 === 0).map((p) => p.recall) },
              { name: "reflect", color: "var(--opinion)", data: s.opsSeries.filter((_, i) => i % 4 === 0).map((p) => p.reflect) },
              { name: "retain", color: "var(--world)", data: s.opsSeries.filter((_, i) => i % 4 === 0).map((p) => p.retain) },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Four-network mix" subtitle="epistemic distribution of the active bank" icon={<Layers size={15} />} />
          <Donut slices={netMix} centerLabel="total" centerValue={String(netMix.reduce((a, n) => a + n.value, 0))} />
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Mean opinion confidence</span>
              <span className="font-mono text-ink">{(avgConf || 0).toFixed(2)}</span>
            </div>
            <Progress value={(avgConf || 0) * 100} color="var(--opinion)" />
          </div>
        </Card>
      </div>

      {/* app health + latency structure */}
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <Card>
          <CardHeader title="App health" subtitle="mounted apps · orchestrator fleet" icon={<Workflow size={15} />} right={
            <Link href="/sandbox/orchestrator" className="text-[11px] text-accent hover:underline flex items-center gap-0.5">
              Open canvas <ArrowUpRight size={11} />
            </Link>
          } />
          <div className="space-y-2.5">
            {s.metrics.map((m) => (
              <Link
                key={m.appId}
                href={
                  m.appId === "memory" ? "/sandbox/memory"
                  : m.appId === "prompts" ? "/sandbox/prompts"
                  : m.appId === "context" ? "/sandbox/context"
                  : m.appId === "learning" ? "/sandbox/learning"
                  : "/sandbox/orchestrator"
                }
                className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-2 p-3 hover:border-accent-border transition-colors group"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: m.status === "healthy" ? "var(--ok)" : m.status === "degraded" ? "var(--warn)" : "var(--faint)" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink truncate group-hover:text-accent transition-colors">{m.label}</p>
                  <p className="text-[11px] text-faint font-mono">
                    {fmtNum(m.ops)} ops · p50 {m.p50}ms · err {m.errorRate}%
                  </p>
                </div>
                <Sparkline data={m.series} width={80} height={26} color={m.status === "healthy" ? "var(--observation)" : "var(--warn)"} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recall latency structure"
            subtitle="simulated per-stage p50 (ms) — construction is background, retrieval is user-facing"
            icon={<Gauge size={15} />}
          />
          <HBarChart items={latencyBars} unit="ms" max={80} />
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { l: "Token budget", v: fmtNum(s.recallSettings.maxTokens) },
              { l: "Search depth", v: s.recallSettings.budget },
              { l: "RRF k", v: String(s.recallSettings.rrfK) },
            ].map((x) => (
              <div key={x.l} className="rounded-lg border border-border-soft bg-surface-2 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-faint">{x.l}</p>
                <p className="text-sm font-mono text-accent mt-0.5">{x.v}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* event stream */}
      <Card>
        <CardHeader title="Event stream" subtitle="every retain, recall, consolidation and orchestration event" icon={<Sparkles size={15} />} />
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {s.events.slice(0, 30).map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-2 transition-colors text-[12.5px]">
              <Badge
                color={
                  e.op === "retain" ? "var(--world)"
                  : e.op === "recall" ? "var(--observation)"
                  : e.op === "reflect" ? "var(--opinion)"
                  : e.op === "consolidate" ? "var(--experience)"
                  : undefined
                }
                className="mt-0.5 w-20 justify-center"
              >
                {e.op}
              </Badge>
              <span className="text-muted flex-1 min-w-0 leading-relaxed">
                <span className="text-ink font-medium">{e.app}</span> · {e.message}
              </span>
              <span className="text-faint font-mono text-[11px] shrink-0 flex items-center gap-2">
                {e.tokens ? `${e.tokens} tok` : ""}
                {e.latencyMs ? fmtMs(e.latencyMs) : ""}
                {timeAgo(e.at)}
              </span>
            </div>
          ))}
          {!s.events.length && <Empty title="No events yet" hint="Retain something in the Memory app to start the stream." />}
        </div>
      </Card>
    </div>
  );
}
