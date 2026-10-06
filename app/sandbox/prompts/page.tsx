"use client";

/* Prompt Studio — versioned templates with variables, live
   disposition verbalization, A/B compare and test runs against
   the active memory bank. */

import { useMemo, useState } from "react";
import {
  Copy, GitCompareArrows, Play, Plus, RefreshCw, Save, Sparkles, Trash2, History, BrainCircuit,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Progress, Slider, Tabs, Textarea, Toggle } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { useSandbox } from "@/lib/store";
import { verbalizeDisposition } from "@/lib/engine/reflect";
import { recall } from "@/lib/engine/recall";
import { cn, fmtMs, timeAgo } from "@/lib/utils";
import type { Disposition, PromptTemplate } from "@/lib/types";

export default function PromptsPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  const [tab, setTab] = useState<"editor" | "compare" | "disposition">("editor");
  const [compareWith, setCompareWith] = useState<string | null>(null);

  const active = s.prompts.find((p) => p.id === s.activePromptId) ?? s.prompts[0];

  if (!hydrated) return <Empty title="Restoring sandbox state…" />;
  if (!active)
    return (
      <Card>
        <Empty title="No prompt templates" hint="Create one to get started." />
      </Card>
    );

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* template list */}
        <Card className="h-fit p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[10px] uppercase tracking-widest text-faint font-semibold">Templates</p>
            <NewPromptButton />
          </div>
          <div className="space-y-1">
            {s.prompts.map((p) => (
              <button
                key={p.id}
                onClick={() => useSandbox.setState({ activePromptId: p.id })}
                className={cn(
                  "w-full text-left rounded-lg px-2.5 py-2 transition-colors border",
                  p.id === active.id ? "bg-accent-soft border-accent-border/50" : "border-transparent hover:bg-surface-2"
                )}
              >
                <span className={cn("block text-[12.5px] font-medium truncate", p.id === active.id ? "text-accent" : "text-ink")}>
                  {p.name}
                </span>
                <span className="block text-[10.5px] text-faint truncate mt-0.5">{p.description}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-border-soft mt-3 pt-3 px-1">
            <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-2">Variables detected</p>
            <div className="flex flex-wrap gap-1">
              {active.variables.map((v) => (
                <span key={v} className="chip" style={{ color: "var(--accent-2)" }}>{`{{${v}}}`}</span>
              ))}
            </div>
          </div>
        </Card>

        {/* main panel */}
        <div className="space-y-4 min-w-0">
          <Tabs
            active={tab}
            onChange={(t) => setTab(t as typeof tab)}
            tabs={[
              { id: "editor", label: "Editor" },
              { id: "compare", label: "A/B Compare" },
              { id: "disposition", label: "Disposition & Bank" },
            ]}
          />

          {tab === "editor" && <EditorPane prompt={active} />}
          {tab === "compare" && (
            <ComparePane prompt={active} compareWith={compareWith} setCompareWith={setCompareWith} all={s.prompts} />
          )}
          {tab === "disposition" && <DispositionPane prompt={active} />}
        </div>
      </div>
    </div>
  );
}

/* ============ Editor ============ */

function EditorPane({ prompt }: { prompt: PromptTemplate }) {
  const s = useSandbox();
  const [name, setName] = useState(prompt.name);
  const [system, setSystem] = useState(prompt.system);
  const [user, setUser] = useState(prompt.user);
  const [note, setNote] = useState("");
  const [testQuery, setTestQuery] = useState("Should we pick Redis or Valkey for caching?");
  const [runOut, setRunOut] = useState<{ response: string; latencyMs: number; tokens: number; score: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const variables = useMemo(() => {
    const vars = new Set<string>();
    for (const m of (system + user).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
    return [...vars];
  }, [system, user]);

  const dirty = name !== prompt.name || system !== prompt.system || user !== prompt.user;

  const save = () => {
    s.updatePrompt(prompt.id, { name, system, user, description: prompt.description, variables });
    setRunOut(null);
    s.logEvent({ app: "prompts", op: "system", message: `Prompt "${name}" updated (unsaved draft committed)` });
  };

  const testRun = () => {
    setBusy(true);
    setTimeout(() => {
      const facts = s.facts.filter((f) => f.bankId === s.activeBankId);
      const links = s.links;
      const observations = s.observations.filter((o) => o.bankId === s.activeBankId);
      const t0 = performance.now();
      const t = recall({ query: testQuery, facts, links, observations, opinions: [], settings: s.recallSettings });
      const latency = t.latencyMs + 400 + Math.random() * 300;
      const grounded = t.selected.length > 0;
      const response = grounded
        ? `Based on ${t.selected.length} recalled memories: ${t.selected.slice(0, 2).map((c) => c.fact.text).join(" ")}`
        : "No grounded memories found for this query.";
      const score = Math.round(Math.min(100, 40 + t.selected.length * 9 + (grounded ? 15 : 0)));
      setRunOut({ response, latencyMs: latency, tokens: t.tokensUsed, score });
      s.logPromptRun(prompt.id, { latencyMs: Math.round(latency), tokens: t.tokensUsed, score });
      s.logEvent({ app: "prompts", op: "recall", message: `Test run of "${name}" → score ${score}`, latencyMs: Math.round(latency) });
      setBusy(false);
      void (performance.now() - t0);
    }, 420);
  };

  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4">
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-56 font-mono text-xs" />
            {dirty && <Badge color="var(--warn)">unsaved</Badge>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(system + "\n---\n" + user)}>
                <Copy size={12} /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={save} disabled={!dirty}>
                <Save size={12} /> Save
              </Button>
              <Button size="sm" variant="primary" onClick={() => { save(); s.savePromptVersion(prompt.id, note || "manual save"); setNote(""); }}>
                <History size={12} /> Save as version
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-1.5">System message</p>
              <Textarea rows={10} value={system} onChange={(e) => setSystem(e.target.value)} className="font-mono text-[12px] leading-relaxed" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-1.5">User message</p>
              <Textarea rows={3} value={user} onChange={(e) => setUser(e.target.value)} className="font-mono text-[12px] leading-relaxed" />
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Version note (optional)…" className="text-xs" />
          </div>
          <VariablePreview text={system} vars={variables} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Test run" subtitle="executes recall with the active bank + tuning" icon={<Play size={15} />} />
          <div className="flex gap-2">
            <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Query…" className="text-xs" />
            <Button variant="primary" size="sm" onClick={testRun} disabled={busy} className="shrink-0">
              {busy ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />} Run
            </Button>
          </div>
          {runOut && (
            <div className="mt-3 space-y-2.5 anim-fade-up">
              <p className="text-[12.5px] text-ink leading-relaxed rounded-lg border border-border-soft bg-surface-2 p-3">
                {runOut.response}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border-soft bg-surface-2 py-2">
                  <p className="text-sm font-mono text-accent">{runOut.score}</p>
                  <p className="text-[9.5px] uppercase text-faint tracking-wider">score</p>
                </div>
                <div className="rounded-lg border border-border-soft bg-surface-2 py-2">
                  <p className="text-sm font-mono text-ink">{fmtMs(runOut.latencyMs)}</p>
                  <p className="text-[9.5px] uppercase text-faint tracking-wider">latency</p>
                </div>
                <div className="rounded-lg border border-border-soft bg-surface-2 py-2">
                  <p className="text-sm font-mono text-ink">{runOut.tokens}</p>
                  <p className="text-[9.5px] uppercase text-faint tracking-wider">tokens</p>
                </div>
              </div>
            </div>
          )}
          {prompt.runs.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-2">Run history · score</p>
              <LineChart
                height={110}
                series={[{ name: "score", color: "var(--accent)", data: prompt.runs.slice(-20).map((r) => r.score) }]}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Version history" subtitle="restore any previous draft" icon={<History size={15} />} right={<Badge>{prompt.versions.length}</Badge>} />
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {[...prompt.versions].reverse().map((v) => (
              <div key={v.v} className="rounded-lg border border-border-soft bg-surface-2 p-2.5 group">
                <div className="flex items-center gap-2">
                  <span className="chip" style={{ color: "var(--accent)" }}>v{v.v}</span>
                  <span className="text-[11px] text-ink truncate flex-1">{v.note || "—"}</span>
                  <span className="text-[10px] text-faint font-mono">{timeAgo(v.savedAt)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 px-2 text-[10.5px]"
                    onClick={() => { setSystem(v.system); setUser(v.user); }}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            ))}
            {!prompt.versions.length && <p className="text-[11px] text-faint italic px-1">No versions saved yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function VariablePreview({ text, vars }: { text: string; vars: string[] }) {
  const s = useSandbox();
  const bank = s.banks.find((b) => b.id === s.activeBankId);
  if (!vars.length) return null;
  const values: Record<string, string> = {
    agent_name: bank?.name ?? "Atlas",
    background: bank?.background ?? "",
    disposition: bank ? verbalizeDisposition(bank.disposition, bank.bias) : "",
    query: "…",
    now: new Date().toISOString().slice(0, 10),
  };
  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-bg-soft p-3">
      <p className="text-[10px] uppercase tracking-widest text-faint font-semibold mb-1.5">Resolved preview</p>
      <p className="text-[11.5px] font-mono text-muted leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
        {text.replace(/\{\{(\w+)\}\}/g, (_, v) => values[v] ?? `{{${v}}}`)}
      </p>
    </div>
  );
}

/* ============ Compare ============ */

function ComparePane({
  prompt,
  compareWith,
  setCompareWith,
  all,
}: {
  prompt: PromptTemplate;
  compareWith: string | null;
  setCompareWith: (id: string | null) => void;
  all: PromptTemplate[];
}) {
  const other = all.find((p) => p.id === compareWith && p.id !== prompt.id);
  return (
    <Card>
      <CardHeader
        title="A/B compare"
        subtitle="diff two templates side by side"
        icon={<GitCompareArrows size={15} />}
        right={
          <select
            className="chip cursor-pointer bg-surface-2"
            value={compareWith ?? ""}
            onChange={(e) => setCompareWith(e.target.value || null)}
          >
            <option value="">choose template…</option>
            {all.filter((p) => p.id !== prompt.id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        }
      />
      <div className="grid md:grid-cols-2 gap-3">
        {[prompt, other].map((p, i) => (
          <div key={i} className={cn("rounded-xl border p-3", i === 0 ? "border-accent-border/50 bg-accent-soft/40" : "border-border-soft bg-surface-2")}>
            <p className="text-xs font-semibold text-ink mb-2 font-mono">{p?.name ?? "—"}</p>
            <pre className="text-[11px] font-mono text-muted whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {p ? p.system + "\n\n--- user ---\n" + p.user : "select a template to compare"}
            </pre>
            {p && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="chip">vars: {p.variables.length}</span>
                <span className="chip">versions: {p.versions.length}</span>
                <span className="chip">β {p.bias}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============ Disposition ============ */

function DispositionPane({ prompt }: { prompt: PromptTemplate }) {
  const s = useSandbox();
  const bank = s.banks.find((b) => b.id === s.activeBankId)!;
  const [bgSnippet, setBgSnippet] = useState("");
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);

  const setD = (patch: Partial<Disposition>) => {
    s.updateBank(bank.id, { disposition: { ...bank.disposition, ...patch } });
    s.updatePrompt(prompt.id, { disposition: { ...bank.disposition, ...patch } });
  };

  const verbalization = verbalizeDisposition(bank.disposition, bank.bias);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader
          title="Disposition parameters Θ = (S, L, E, β)"
          subtitle="written to the active bank and mirrored on this template"
          icon={<BrainCircuit size={15} />}
        />
        <div className="space-y-5">
          <Slider label="Skepticism — 1 trusting → 5 skeptical" min={1} max={5} value={bank.disposition.skepticism} onChange={(v) => setD({ skepticism: v })} />
          <Slider label="Literalism — 1 flexible → 5 literal" min={1} max={5} value={bank.disposition.literalism} onChange={(v) => setD({ literalism: v })} />
          <Slider label="Empathy — 1 detached → 5 empathetic" min={1} max={5} value={bank.disposition.empathy} onChange={(v) => setD({ empathy: v })} />
          <Slider
            label="Bias strength β — how strongly Θ shapes output"
            min={0} max={1} step={0.05}
            value={bank.bias}
            onChange={(v) => { s.updateBank(bank.id, { bias: v }); s.updatePrompt(prompt.id, { bias: v }); }}
            format={(v) => v.toFixed(2)}
          />
          <div className="flex gap-2">
            {([
              { l: "Analyst", d: { skepticism: 5, literalism: 4, empathy: 2 }, b: 0.6 },
              { l: "Coach", d: { skepticism: 2, literalism: 2, empathy: 5 }, b: 0.7 },
              { l: "Neutral (benchmark)", d: { skepticism: 3, literalism: 3, empathy: 3 }, b: 0.2 },
            ] as const).map((preset) => (
              <Button
                key={preset.l}
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { s.updateBank(bank.id, { disposition: preset.d, bias: preset.b }); s.updatePrompt(prompt.id, { disposition: preset.d, bias: preset.b }); }}
              >
                {preset.l}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Verbalization φ(Θ)" subtitle="injected into every reflect system message" icon={<Sparkles size={15} />} />
          <p className="text-[12.5px] text-muted leading-relaxed rounded-lg border border-accent-border/40 bg-accent-soft p-3">
            {verbalization}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint mb-2">Same facts, two profiles</p>
              <div className="space-y-2 text-[11.5px]">
                <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5">
                  <p className="text-faint font-mono text-[10px] mb-1">(S1, L2, E5) →</p>
                  <p className="text-muted leading-snug">“Remote work enables creative flexibility and spontaneous innovation.”</p>
                </div>
                <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5">
                  <p className="text-faint font-mono text-[10px] mb-1">(S5, L5, E1) →</p>
                  <p className="text-muted leading-snug">“Remote work lacks the structure and accountability needed for consistent performance.”</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint mb-2">Directives (hard rules)</p>
              <div className="space-y-1.5">
                {bank.directives.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2">
                    <Toggle
                      checked={d.active}
                      onChange={(v) =>
                        s.updateBank(bank.id, {
                          directives: bank.directives.map((x) => (x.id === d.id ? { ...x, active: v } : x)),
                        })
                      }
                    />
                    <span className="text-[11.5px] text-muted flex-1 leading-snug">{d.content}</span>
                    <span className="chip shrink-0">P{d.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Background merging h′ = Merge(h, h_new)" subtitle="conflicts resolve toward the new info; voice stays first-person" icon={<Save size={15} />} />
          <Textarea rows={2} value={bgSnippet} onChange={(e) => setBgSnippet(e.target.value)} placeholder='e.g. "You were born in Texas and have 10 years of startup experience."' className="text-xs" />
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!bgSnippet.trim()}
              onClick={() => {
                const r = s.mergeBankBackground(bgSnippet);
                setMergeMsg(r.conflict ? "Conflict detected — resolved in favor of new information." : "Background enriched.");
                setBgSnippet("");
              }}
            >
              Merge into bank background
            </Button>
            {mergeMsg && <span className="text-[11px] text-ok anim-fade-up">{mergeMsg}</span>}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed rounded-lg bg-surface-2 border border-border-soft p-2.5">
            {bank.background}
          </p>
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-widest text-faint mb-1">Background length budget</p>
            <Progress value={Math.min(100, (bank.background.length / 320) * 100)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============ New prompt ============ */

function NewPromptButton() {
  const s = useSandbox();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setOpen(true)}>
        <Plus size={12} />
      </Button>
      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-sm p-5 anim-fade-up" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-3">New template</h3>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-prompt" className="font-mono text-xs" autoFocus />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!name.trim()}
                onClick={() => {
                  s.addPrompt({
                    name: name.trim(),
                    description: "Custom template",
                    system: "You are {{agent_name}}.\n{{disposition}}",
                    user: "{{query}}",
                    variables: ["agent_name", "disposition", "query"],
                    disposition: { skepticism: 3, literalism: 3, empathy: 3 },
                    bias: 0.3,
                  });
                  setOpen(false);
                  setName("");
                }}
              >
                <Trash2 size={0} className="hidden" /> Create
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
