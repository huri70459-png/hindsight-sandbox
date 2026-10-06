"use client";

/* Evaluation — a runnable benchmark harness in the sandbox:
   recall at multiple top-k cutoffs, deterministic judging,
   token-efficiency accounting, structured per-question results
   in the published result format, run history comparison and
   user-contributed question sets. */

import { useMemo, useState } from "react";
import {
  FlaskConical, History, Play, RefreshCw, Trash2, Trophy, Upload, ChevronDown, ChevronRight,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Tabs, Textarea } from "@/components/ui";
import { HBarChart, LineChart } from "@/components/charts";
import { useSandbox } from "@/lib/store";
import { CONTRIB_SCHEMA } from "@/lib/data/evalset";
import { cn, fmtMs, timeAgo } from "@/lib/utils";
import type { EvalGroup, EvalQuestionResult, EvalRun } from "@/lib/types";

const GROUP_COLORS: Record<EvalGroup, string> = {
  "single-hop": "var(--world)",
  "multi-hop": "var(--experience)",
  temporal: "var(--opinion)",
  "knowledge-update": "var(--danger)",
  preference: "var(--observation)",
};

type Tab = "runner" | "history" | "contribute";

export default function EvalPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  const [tab, setTab] = useState<Tab>("runner");
  const [setId, setSetId] = useState("set-seed");
  const [runName, setRunName] = useState("");
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<EvalRun | null>(null);

  const set = s.evalSets.find((x) => x.id === setId) ?? s.evalSets[0];

  const startRun = () => {
    if (!set) return;
    setBusy(true);
    setTimeout(() => {
      const run = s.runEval(
        runName.trim() || `run-${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
        set.questions
      );
      setLatest(run);
      setBusy(false);
      setRunName("");
    }, 350);
  };

  if (!hydrated) return <Empty title="Restoring sandbox state…" />;

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Tabs
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "runner", label: "Runner" },
          { id: "history", label: "Run history", count: s.evalRuns.length },
          { id: "contribute", label: "Contribute a benchmark" },
        ]}
      />

      {tab === "runner" && (
        <div className="grid lg:grid-cols-[340px_1fr] gap-4">
          {/* controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader title="Evaluation run" subtitle="single-pass retrieval: one recall per question, no agentic loops" icon={<FlaskConical size={15} />} />
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">Question set</p>
                  <select
                    value={setId}
                    onChange={(e) => setSetId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-ink outline-none cursor-pointer"
                  >
                    {s.evalSets.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.questions.length} q)
                      </option>
                    ))}
                  </select>
                  {set && <p className="text-[10.5px] text-faint mt-1.5 leading-relaxed">{set.description}</p>}
                </div>
                <Input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="Run name (optional)…" className="text-xs" />
                <Button variant="primary" className="w-full" onClick={startRun} disabled={busy}>
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                  {busy ? "Evaluating…" : "Run evaluation"}
                </Button>
                <div className="rounded-lg border border-border-soft bg-bg-soft p-2.5 text-[10.5px] text-faint leading-relaxed">
                  Uses the <b className="text-muted">current Context Tuning settings</b> (budget, max_tokens, rerank,
                  boosts). Change tuning → re-run → compare in history. Judge is deterministic gold-token overlap —
                  a stand-in for LLM-as-judge with the same result shape.
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Group mix" icon={<Trophy size={15} />} />
              {set && (
                <div className="space-y-1.5">
                  {(["single-hop", "multi-hop", "temporal", "knowledge-update", "preference"] as EvalGroup[]).map((g) => {
                    const n = set.questions.filter((q) => q.group === g).length;
                    return (
                      <div key={g} className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: GROUP_COLORS[g] }} />
                        <span className="text-muted flex-1">{g}</span>
                        <span className="font-mono text-ink">{n}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* results */}
          <div className="space-y-4 min-w-0">
            {(latest ?? s.evalRuns[0]) ? (
              <RunResults run={latest ?? s.evalRuns[0]} />
            ) : (
              <Card>
                <Empty
                  icon={<FlaskConical size={30} />}
                  title="No evaluation runs yet"
                  hint="Run the built-in set to measure accuracy@k, token efficiency and latency of the current tuning."
                />
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "history" && <HistoryTab />}
      {tab === "contribute" && <ContributeTab />}
    </div>
  );
}

/* ============ run results ============ */

function RunResults({ run }: { run: EvalRun }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<EvalGroup | "all">("all");

  const byGroup = useMemo(() => {
    const groups = [...new Set(run.results.map((r) => r.group))] as EvalGroup[];
    return groups.map((g) => {
      const rs = run.results.filter((r) => r.group === g);
      const correct = rs.filter((r) => r.judgment.judgment === "CORRECT").length;
      return { group: g, accuracy: Math.round((correct / rs.length) * 100), n: rs.length };
    });
  }, [run]);

  const shown = run.results.filter((r) => groupFilter === "all" || r.group === groupFilter);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Accuracy @all", v: `${run.accuracy}%`, c: "var(--accent)" },
          { l: "Accuracy @top_5", v: `${run.accuracyByCutoff["top_5"]}%`, c: "var(--observation)" },
          { l: "Mean tokens / query", v: String(run.meanTokens), c: "var(--world)" },
          { l: "Retrieval p50", v: fmtMs(run.p50LatencyMs), c: "var(--opinion)" },
        ].map((x) => (
          <Card key={x.l} className="py-3 text-center">
            <p className="text-2xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</p>
            <p className="text-[10px] uppercase tracking-wider text-faint mt-1">{x.l}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Accuracy by cutoff" subtitle="does depth help? compare top_5 / top_10 / all selected" icon={<Trophy size={15} />} />
          <HBarChart
            items={Object.entries(run.accuracyByCutoff).map(([k, v]) => ({ label: k.replace("_", " "), value: v }))}
            max={100}
            unit="%"
          />
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-faint mb-2">By question group</p>
            <div className="space-y-1.5">
              {byGroup.map((g) => (
                <button key={g.group} onClick={() => setGroupFilter(groupFilter === g.group ? "all" : g.group)} className="w-full text-left">
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className={cn("flex items-center gap-1.5", groupFilter === g.group ? "text-accent" : "text-muted")}>
                      <span className="w-2 h-2 rounded-full" style={{ background: GROUP_COLORS[g.group] }} />
                      {g.group} <span className="text-faint">({g.n})</span>
                    </span>
                    <span className="font-mono text-ink">{g.accuracy}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${g.accuracy}%`, background: GROUP_COLORS[g.group] }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={`Run · ${run.name}`}
            subtitle={`${timeAgo(run.at)} · bank ${run.bankId} · budget=${run.settingsSnapshot.budget} · max_tokens=${run.settingsSnapshot.maxTokens} · rerank=${run.settingsSnapshot.rerankEnabled ? "on" : "off"} · k=${run.settingsSnapshot.rrfK}`}
            icon={<History size={15} />}
          />
          <div className="rounded-lg border border-border-soft bg-bg-soft p-3 text-[11px] text-muted leading-relaxed">
            <b className="text-ink">Token efficiency.</b> Accuracy alone is not comparable across systems — a run
            scoring 95% at 25k tokens/query is not better than 90% at 4k. This run averages{" "}
            <span className="font-mono text-accent">{run.meanTokens} tokens/query</span> at{" "}
            <span className="font-mono text-accent">{run.accuracy}%</span> accuracy under the current budget.
          </div>
          <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
            {shown.map((r) => (
              <QuestionRow key={r.id} r={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function QuestionRow({ r, expanded, onToggle }: { r: EvalQuestionResult; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={cn("rounded-lg border transition-colors", expanded ? "border-accent-border/60 bg-accent-soft/30" : "border-border-soft bg-surface-2 hover:border-border")}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {expanded ? <ChevronDown size={13} className="text-faint shrink-0" /> : <ChevronRight size={13} className="text-faint shrink-0" />}
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", r.judgment.judgment === "CORRECT" ? "bg-ok" : "bg-danger")} />
        <span className="text-[11.5px] text-ink truncate flex-1">{r.question}</span>
        <Badge color={GROUP_COLORS[r.group]} className="shrink-0 hidden md:inline-flex">{r.group}</Badge>
        <span className="font-mono text-[10.5px] text-muted shrink-0 tabular-nums">{r.judgment.score.toFixed(2)}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 anim-fade-up">
          <pre className="text-[10.5px] font-mono text-muted leading-relaxed rounded-lg border border-border-soft bg-bg-soft p-3 overflow-x-auto max-h-72 overflow-y-auto">
            {JSON.stringify(r, null, 2)}
          </pre>
          <p className="text-[10.5px] text-faint mt-1.5 leading-relaxed">
            <b className="text-muted">Judge:</b> {r.judgment.reason}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============ history ============ */

function HistoryTab() {
  const s = useSandbox();
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);
  const a = s.evalRuns.find((r) => r.id === selA);
  const b = s.evalRuns.find((r) => r.id === selB);

  if (!s.evalRuns.length)
    return (
      <Card>
        <Empty icon={<History size={28} />} title="No runs recorded" hint="Runs you execute in the Runner tab accumulate here for comparison." />
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Accuracy trend across runs" subtitle="chronological — tune, re-run, watch the line move" icon={<Trophy size={15} />} />
          <LineChart
            height={200}
            labels={[...s.evalRuns].reverse().map((r) => r.name.slice(0, 10))}
            series={[
              { name: "accuracy @all", color: "var(--accent)", data: [...s.evalRuns].reverse().map((r) => r.accuracy) },
              { name: "accuracy @top_5", color: "var(--observation)", data: [...s.evalRuns].reverse().map((r) => r.accuracyByCutoff["top_5"]), dashed: true },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Token efficiency trend" subtitle="mean tokens per query — lower is cheaper at equal accuracy" icon={<FlaskConical size={15} />} />
          <LineChart
            height={200}
            labels={[...s.evalRuns].reverse().map((r) => r.name.slice(0, 10))}
            series={[{ name: "mean tokens/query", color: "var(--world)", data: [...s.evalRuns].reverse().map((r) => r.meanTokens) }]}
          />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 pb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold text-ink">Runs</h3>
          <span className="text-xs text-faint">select two to compare</span>
          <div className="ml-auto flex gap-2">
            <select value={selA ?? ""} onChange={(e) => setSelA(e.target.value || null)} className="chip cursor-pointer bg-surface-2 max-w-40">
              <option value="">compare A…</option>
              {s.evalRuns.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.accuracy}%</option>)}
            </select>
            <select value={selB ?? ""} onChange={(e) => setSelB(e.target.value || null)} className="chip cursor-pointer bg-surface-2 max-w-40">
              <option value="">compare B…</option>
              {s.evalRuns.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.accuracy}%</option>)}
            </select>
          </div>
        </div>
        {a && b && (
          <div className="mx-4 mb-3 rounded-xl border border-accent-border/40 bg-accent-soft p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-center anim-fade-up">
            {[
              { l: "accuracy", av: a.accuracy, bv: b.accuracy, u: "%" },
              { l: "top_5", av: a.accuracyByCutoff["top_5"], bv: b.accuracyByCutoff["top_5"], u: "%" },
              { l: "tokens/q", av: a.meanTokens, bv: b.meanTokens, u: "" },
              { l: "p50", av: a.p50LatencyMs, bv: b.p50LatencyMs, u: "ms" },
            ].map((x) => (
              <div key={x.l}>
                <p className="text-[10px] uppercase tracking-wider text-faint">{x.l}</p>
                <p className="text-sm font-mono mt-0.5">
                  <span className={x.av >= x.bv ? "text-ok" : "text-danger"}>{x.av}{x.u}</span>
                  <span className="text-faint mx-1.5">vs</span>
                  <span className={x.bv >= x.av ? "text-ok" : "text-danger"}>{x.bv}{x.u}</span>
                </p>
              </div>
            ))}
          </div>
        )}
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-y border-border-soft bg-surface-2 text-faint">
              {["Run", "When", "Settings", "Acc @all", "@top_5", "@top_10", "tok/q", "p50", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.evalRuns.map((r) => (
              <tr key={r.id} className="border-b border-border-soft/60 hover:bg-surface-2 transition-colors">
                <td className="px-3 py-2 text-ink font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted">{timeAgo(r.at)}</td>
                <td className="px-3 py-2">
                  <span className="chip">{r.settingsSnapshot.budget} · {r.settingsSnapshot.maxTokens}t · rerank {r.settingsSnapshot.rerankEnabled ? "on" : "off"}</span>
                </td>
                <td className="px-3 py-2 font-mono text-accent">{r.accuracy}%</td>
                <td className="px-3 py-2 font-mono text-muted">{r.accuracyByCutoff["top_5"]}%</td>
                <td className="px-3 py-2 font-mono text-muted">{r.accuracyByCutoff["top_10"]}%</td>
                <td className="px-3 py-2 font-mono text-muted">{r.meanTokens}</td>
                <td className="px-3 py-2 font-mono text-muted">{fmtMs(r.p50LatencyMs)}</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-faint hover:text-danger" onClick={() => s.deleteEvalRun(r.id)}>
                    <Trash2 size={12} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ============ contribute ============ */

function ContributeTab() {
  const s = useSandbox();
  const [json, setJson] = useState(CONTRIB_SCHEMA);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader
          title="Contribute a benchmark set"
          subtitle="question sets follow one schema — import yours and run it against any tuning configuration"
          icon={<Upload size={15} />}
        />
        <Textarea rows={16} value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-[11.5px] leading-relaxed" spellCheck={false} />
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="primary"
            onClick={() => {
              const r = s.importEvalSet(json);
              setMsg(r.ok ? { ok: true, text: `✓ Imported "${r.name}" — select it in the Runner tab.` } : { ok: false, text: `✗ ${r.error}` });
            }}
          >
            <Upload size={13} /> Validate & import
          </Button>
          {msg && <span className={cn("text-[11px] font-mono anim-fade-up", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</span>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Schema notes" icon={<Trophy size={15} />} />
        <div className="space-y-2.5 text-[12px] text-muted leading-relaxed">
          <p><b className="text-ink font-mono">group</b> — one of: single-hop, multi-hop, temporal, knowledge-update, preference. Groups drive the per-category breakdown, mirroring LongMemEval/LoCoMo families.</p>
          <p><b className="text-ink font-mono">groundTruth</b> — the expected answer. The judge uses its salient tokens for coverage scoring.</p>
          <p><b className="text-ink font-mono">goldHints</b> — phrases that must appear (token-wise) in retrieved context for a strong score. Keep them short and specific: entity names, dates, decisive terms.</p>
          <p><b className="text-ink font-mono">judgment</b> — score = 0.7 × hint coverage + 0.3 × ground-truth token recall; ≥ 0.5 ⇒ CORRECT. The deterministic judge replaces an LLM-as-judge for offline reproducibility; swap in a real judge by posting results through the store's <code className="chip">runEval</code> path.</p>
          <p className="text-[11px] text-faint">
            Results are recorded in the published structured format — retrieval (query, results, latency, totals),
            judgment (verdict, score, reason, model), and cutoff_results at top_5 / top_10 / all — so runs are
            diffable and exportable.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {s.evalSets.map((x) => (
              <span key={x.id} className="chip">{x.name} · {x.questions.length} q</span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}


