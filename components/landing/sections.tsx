"use client";

import Link from "next/link";
import { ArrowRight, Github, BookOpen, Eye } from "lucide-react";
import { HeroGraph } from "./HeroGraph";
import { siteBenchmarks, codingAgents } from "@/lib/data/benchmarks";
import { Scatter } from "@/components/charts";
import { Badge, Button } from "@/components/ui";
import {
  BrainCircuit, GitBranch, Layers, MessageSquareText, RefreshCw, Sparkles,
  Clock4, Network, Search, Database, Workflow, GraduationCap, Gauge, SlidersHorizontal,
} from "lucide-react";

/* ================= Navbar ================= */

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 glass border-b border-border-soft">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink">
          <span className="w-7 h-7 rounded-lg bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] grid place-items-center text-white shadow-[0_0_18px_-4px_var(--glow)]">
            <Eye size={15} />
          </span>
          <span className="tracking-tight">
            Hindsight<span className="text-accent"> Sandbox</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-[13px] text-muted">
          <a href="#benchmarks" className="hover:text-ink transition-colors">Benchmarks</a>
          <a href="#how" className="hover:text-ink transition-colors">How it works</a>
          <a href="#apps" className="hover:text-ink transition-colors">Apps</a>
          <a href="#retrieval" className="hover:text-ink transition-colors">Retrieval</a>
          <Link href="/sandbox/benchmarks" className="hover:text-ink transition-colors">Papers</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => window.open("https://github.com/vectorize-io/hindsight", "_blank")}>
            <Github size={14} /> Upstream
          </Button>
          <Link href="/sandbox">
            <Button size="sm" variant="primary">
              Launch sandbox <ArrowRight size={13} />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ================= Hero ================= */

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      <div className="absolute inset-0 hero-grid pointer-events-none" />
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[520px] rounded-full pointer-events-none opacity-60 blur-3xl"
        style={{ background: "radial-gradient(ellipse, var(--accent-soft), transparent 65%)" }}
      />
      <div className="max-w-6xl mx-auto px-5 relative">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
          <div className="anim-fade-up">
            <div className="flex items-center gap-2 mb-5">
              <Badge color="var(--accent)">MIT · open source</Badge>
              <Badge>Next.js App Router</Badge>
              <Badge>zero backend required</Badge>
            </div>
            <h1 className="text-[42px] leading-[1.06] md:text-[56px] font-extrabold tracking-tight text-ink">
              Agent memory
              <br />
              <span className="gradient-text">you can watch think.</span>
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-muted max-w-xl">
              A sandbox that models the retain → recall → reflect loop end-to-end in your browser: four memory
              networks, a temporal entity graph, four-arm retrieval with rank fusion, evolving opinions — plus an
              orchestrator to mount, wire and route whole apps around it. UI-inspired by{" "}
              <a href="https://hindsight.vectorize.io/" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                hindsight.vectorize.io
              </a>
              .
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/sandbox">
                <Button variant="primary" size="lg">
                  Open the sandbox <ArrowRight size={16} />
                </Button>
              </Link>
              <Button variant="outline" size="lg" onClick={() => window.open("https://arxiv.org/abs/2512.12818", "_blank")}>
                <BookOpen size={15} /> Read the paper
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-faint font-mono">
              <span>retain()</span>
              <span>recall(query, max_tokens)</span>
              <span>reflect(query, Θ)</span>
              <span>consolidate(scopes)</span>
            </div>
          </div>
          <div className="anim-fade-up [animation-delay:120ms]">
            <div className="card glow-ring p-3 relative">
              <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ok anim-pulse-soft" />
                <span className="text-[10px] font-mono text-muted">bank: atlas · graph live</span>
              </div>
              <HeroGraph />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Benchmarks ================= */

export function Benchmarks() {
  return (
    <section id="benchmarks" className="py-20 border-t border-border-soft bg-bg-soft">
      <div className="max-w-6xl mx-auto px-5">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
          <div>
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-2">Benchmarks</p>
            <h2 className="text-3xl font-bold tracking-tight text-ink">Retrieval accuracy, head to head</h2>
          </div>
          <Link href="/sandbox/benchmarks" className="text-sm text-accent hover:underline flex items-center gap-1">
            All benchmarks in-app <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card p-6">
            <div className="space-y-4">
              {siteBenchmarks.map((b) => (
                <div key={b.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted font-medium">{b.name}</span>
                    <span className="font-mono tabular-nums">
                      <span className="text-ink font-bold">{b.hindsight}%</span>
                      {b.nextBest !== null ? (
                        <span className="text-faint"> vs {b.nextBest}%</span>
                      ) : (
                        <span className="text-faint italic text-[10px]"> {b.nextBestLabel}</span>
                      )}
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-surface-2 border border-border-soft overflow-hidden">
                    {b.nextBest !== null && (
                      <div className="absolute inset-y-0 left-0 rounded-full bg-surface-3" style={{ width: `${b.nextBest}%` }} />
                    )}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${b.hindsight}%`, background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-5 mt-5 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" /> Hindsight
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full bg-surface-3 border border-border" /> Next best system
              </span>
            </div>
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink mb-1">Coding agents — corrections vs cost</h3>
            <p className="text-xs text-muted mb-3">
              Every agent solves ~60/61 tasks either way — memory changes what it costs to get there.
            </p>
            <Scatter
              points={codingAgents.map((c) => ({
                x: c.costPerTask,
                y: c.correctionsPerTask,
                label: c.name,
                ours: c.ours,
                size: 8,
                color: c.ours ? "var(--accent)" : undefined,
              }))}
              xLog={false}
              yLog={false}
              xLabel="Cost / task (USD) — cheaper is better ←"
              yLabel="Corrections / task — fewer is better ↑"
              xFormat={(v) => `$${v.toFixed(2)}`}
              yFormat={(v) => v.toFixed(1)}
              height={280}
            />
          </div>
        </div>
        <p className="text-[11px] text-faint mt-4">
          Figures as published at hindsight.vectorize.io and in arXiv:2512.12818 / 2026.acl-demo.27. This sandbox
          re-displays them for study; it does not re-run them.
        </p>
      </div>
    </section>
  );
}

/* ================= Problem ================= */

const PROBLEMS = [
  {
    icon: Search,
    title: "Vector search alone misses time",
    body: "\u201CWhat did Alice do last spring?\u201D is a temporal query, not a similarity query. Without a time channel and occurrence intervals, recency masquerades as relevance.",
  },
  {
    icon: GitBranch,
    title: "Facts drift apart",
    body: "\u201CAlice works at Google\u201D and \u201CGoogle is in Mountain View\u201D should answer \u201Cwhere does Alice work?\u201D together. Entity links make two-hop answers retrievable even when nothing matches lexically.",
  },
  {
    icon: Layers,
    title: "Knowledge has to consolidate",
    body: "A hundred scattered facts about preferences should collapse into a few durable, evidence-grounded observations — deduplicated, refined rather than overwritten, and traceable to quotes.",
  },
  {
    icon: MessageSquareText,
    title: "Context shapes meaning",
    body: "The same memory means different things to different banks. Disposition parameters — skepticism, literalism, empathy, bias — make an agent's stance explicit, stable and tunable.",
  },
];

export function Problems() {
  return (
    <section className="py-20 border-t border-border-soft">
      <div className="max-w-6xl mx-auto px-5">
        <p className="text-xs font-mono text-accent uppercase tracking-widest mb-2">Why this exists</p>
        <h2 className="text-3xl font-bold tracking-tight text-ink max-w-2xl">
          Agents forget everything between sessions — and naive memory blurs evidence with belief.
        </h2>
        <div className="grid md:grid-cols-2 gap-4 mt-10">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="card p-5 hover:border-accent-border transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-accent-soft border border-accent-border/40 grid place-items-center text-accent mb-3 group-hover:scale-105 transition-transform">
                <p.icon size={17} />
              </div>
              <h3 className="text-[15px] font-semibold text-ink">{p.title}</h3>
              <p className="text-[13px] text-muted leading-relaxed mt-1.5">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= How it works ================= */

const OPS = [
  {
    op: "retain",
    color: "var(--world)",
    title: "Store what happened",
    body: "Transcripts become narrative facts with five dimensions (what/when/where/who/why), classified into networks, resolved to canonical entities and linked by time, meaning, identity and cause.",
  },
  {
    op: "recall",
    color: "var(--observation)",
    title: "Search it back",
    body: "Four arms in parallel — semantic, BM25, graph spreading activation, temporal — fused by reciprocal rank, reranked by a cross-encoder, packed into a token budget instead of a top-k.",
  },
  {
    op: "reflect",
    color: "var(--opinion)",
    title: "Reason over it",
    body: "Retrieved memory meets the bank's disposition profile. Answers stay grounded and cited; subjective questions form opinions with confidence that later evidence reinforces or erodes.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-20 border-t border-border-soft bg-bg-soft">
      <div className="max-w-6xl mx-auto px-5">
        <p className="text-xs font-mono text-accent uppercase tracking-widest mb-2">How it works</p>
        <h2 className="text-3xl font-bold tracking-tight text-ink">Three operations, four networks, one graph</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {OPS.map((o) => (
            <div key={o.op} className="card p-6 relative overflow-hidden">
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${o.color}, transparent)` }}
              />
              <code className="chip" style={{ color: o.color, borderColor: `color-mix(in srgb, ${o.color} 40%, transparent)` }}>
                {o.op}()
              </code>
              <h3 className="text-base font-semibold text-ink mt-3">{o.title}</h3>
              <p className="text-[13px] text-muted leading-relaxed mt-2">{o.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 mt-6">
          <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <BrainCircuit size={15} className="text-accent" /> The four-network memory bank — epistemic separation by design
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { net: "world", eg: "\u201CAlice works at Google in Mountain View on the AI team.\u201D", d: "Objective facts about the external world." },
              { net: "experience", eg: "\u201CI recommended Yosemite to Alice for hiking.\u201D", d: "First-person record of the agent's own actions." },
              { net: "observation", eg: "\u201CAlice is a software engineer specializing in ML.\u201D", d: "Preference-neutral entity summaries synthesized from facts." },
              { net: "opinion", eg: "\u201CPython is better for data science because of pandas.\u201D (c = 0.85)", d: "Subjective beliefs with confidence that evolve with evidence." },
            ].map((n) => (
              <div key={n.net} className="rounded-xl border border-border-soft bg-surface-2 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: `var(--${n.net})` }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: `var(--${n.net})` }}>
                    {n.net}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink font-mono leading-relaxed">{n.eg}</p>
                <p className="text-[11.5px] text-muted mt-2 leading-relaxed">{n.d}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-5 text-[11px] text-faint">
            <span className="chip">bank profile P = (name, Θ, background)</span>
            <span className="chip">Θ = (skepticism, literalism, empathy, β)</span>
            <span className="chip">f = (id, bank, text, vec, τs, τe, τm, type, conf, meta)</span>
            <span className="chip">G = (V, E) · E: entity | temporal | semantic | causal</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Retrieval pipeline ================= */

const ARMS = [
  { name: "Semantic", icon: Sparkles, color: "var(--world)", d: "meaning over wording — paraphrases and concepts" },
  { name: "Keyword · BM25", icon: Search, color: "var(--experience)", d: "exact names, technical terms, identifiers" },
  { name: "Graph", icon: Network, color: "var(--observation)", d: "spreading activation over entity & causal links" },
  { name: "Temporal", icon: Clock4, color: "var(--opinion)", d: "time expressions parsed to windows, spread across the range" },
];

export function RetrievalPipeline() {
  return (
    <section id="retrieval" className="py-20 border-t border-border-soft">
      <div className="max-w-6xl mx-auto px-5">
        <p className="text-xs font-mono text-accent uppercase tracking-widest mb-2">Multi-str retrieval</p>
        <h2 className="text-3xl font-bold tracking-tight text-ink">Four arms run in parallel. Consensus wins.</h2>
        <p className="text-sm text-muted mt-3 max-w-2xl">
          No single strategy handles every question, so recall never relies on one. Rank-based fusion means no arm's
          scoring scale can dominate — a memory several strategies agree on outranks a memory one strategy loves.
        </p>
        <div className="card p-6 mt-8 overflow-x-auto">
          <div className="flex items-stretch gap-3 min-w-[760px]">
            <div className="flex flex-col justify-center rounded-xl border border-border-soft bg-surface-2 px-4 py-3 w-40 shrink-0">
              <span className="text-[10px] font-mono text-faint uppercase">query</span>
              <span className="text-xs text-ink font-mono mt-1">“What did Alice do in March?”</span>
              <span className="text-[10px] text-faint mt-2 font-mono">max_tokens: 4096</span>
            </div>
            <ArrowRight size={16} className="text-faint self-center shrink-0" />
            <div className="grid grid-cols-2 gap-2 flex-1">
              {ARMS.map((a) => (
                <div key={a.name} className="rounded-lg border border-border-soft bg-surface-2 p-3">
                  <div className="flex items-center gap-1.5">
                    <a.icon size={13} style={{ color: a.color }} />
                    <span className="text-[11px] font-semibold text-ink">{a.name}</span>
                  </div>
                  <p className="text-[10.5px] text-muted mt-1 leading-snug">{a.d}</p>
                </div>
              ))}
            </div>
            <ArrowRight size={16} className="text-faint self-center shrink-0" />
            <div className="flex flex-col gap-2 w-44 shrink-0">
              {[
                { t: "RRF fusion", s: "Σ 1/(k + rank)" },
                { t: "Cross-encoder", s: "reads query + memory" },
                { t: "Boosts", s: "recency · time · proof" },
                { t: "Token budget", s: "pack, don't top-k" },
              ].map((step, i) => (
                <div key={step.t} className="rounded-lg border border-accent-border/40 bg-accent-soft px-3 py-2">
                  <span className="text-[11px] font-semibold text-ink">
                    {i + 1}. {step.t}
                  </span>
                  <span className="block text-[10px] text-muted font-mono">{step.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Apps showcase ================= */

const APPS = [
  {
    icon: Database,
    href: "/sandbox/memory",
    title: "Memory App",
    body: "Retain transcripts, browse the four networks, walk the entity graph, run recalls with a full pipeline trace and reflect with cited, disposition-shaped answers.",
    color: "var(--world)",
  },
  {
    icon: Sparkles,
    href: "/sandbox/prompts",
    title: "Prompt Engineering",
    body: "Versioned templates with variables, disposition sliders that verbalize live into the system prompt, A/B compare and test runs scored against the memory bank.",
    color: "var(--experience)",
  },
  {
    icon: SlidersHorizontal,
    href: "/sandbox/context",
    title: "Context Tuning",
    body: "Every knob the retrieval docs expose: budget modes, token ceilings, strategy boosts, RRF k, reranker caps, boost alphas, dedup thresholds, missions and scopes.",
    color: "var(--observation)",
  },
  {
    icon: GraduationCap,
    href: "/sandbox/learning",
    title: "Continuous Learning",
    body: "A UMA-style loop: chunks stream in, the agent maintains a memory bank with CRUD tools, core memory evolves, and Ledger-QA episodes score the result.",
    color: "var(--opinion)",
  },
  {
    icon: Workflow,
    href: "/sandbox/orchestrator",
    title: "Orchestrator",
    body: "Mount apps as nodes, wire typed edges between them, choose routing strategies, run the pipeline and watch packets — and per-node latency — flow.",
    color: "var(--accent)",
  },
  {
    icon: Gauge,
    href: "/sandbox/benchmarks",
    title: "Benchmarks",
    body: "LongMemEval, LoCoMo, Ledger-QA horizons and the ten-system construction/energy characterization — sortable tables and charts, sourced to the papers.",
    color: "var(--accent-2)",
  },
];

export function AppsShowcase() {
  return (
    <section id="apps" className="py-20 border-t border-border-soft bg-bg-soft">
      <div className="max-w-6xl mx-auto px-5">
        <p className="text-xs font-mono text-accent uppercase tracking-widest mb-2">The sandbox</p>
        <h2 className="text-3xl font-bold tracking-tight text-ink">Six apps, one orchestrated workspace</h2>
        <p className="text-sm text-muted mt-3 max-w-2xl">
          Each app is mountable on its own — or wire them together on the orchestrator canvas and route facts,
          prompts, context and feedback between them.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {APPS.map((a) => (
            <Link key={a.title} href={a.href} className="card p-5 hover:border-accent-border transition-all group hover:-translate-y-0.5">
              <div
                className="w-9 h-9 rounded-lg grid place-items-center mb-3 border transition-transform group-hover:scale-105"
                style={{ color: a.color, background: `color-mix(in srgb, ${a.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${a.color} 30%, transparent)` }}
              >
                <a.icon size={17} />
              </div>
              <h3 className="text-[15px] font-semibold text-ink flex items-center gap-1.5">
                {a.title}
                <ArrowRight size={13} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all text-accent" />
              </h3>
              <p className="text-[12.5px] text-muted leading-relaxed mt-1.5">{a.body}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/sandbox">
            <Button variant="primary" size="lg">
              <RefreshCw size={15} className="mr-1" /> Mount everything — open the sandbox
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ================= Footer ================= */

export function Footer() {
  return (
    <footer className="border-t border-border-soft py-10 bg-bg">
      <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center gap-4 text-xs text-faint">
        <div className="flex items-center gap-2 font-semibold text-muted">
          <span className="w-5 h-5 rounded bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] grid place-items-center text-white">
            <Eye size={11} />
          </span>
          Hindsight Sandbox
        </div>
        <p className="text-center md:text-left max-w-xl leading-relaxed">
          Open-source (MIT) study sandbox. Not affiliated with Vectorize.io — architecture and UI inspired by the
          Hindsight technical report (arXiv:2512.12818), its ACL 2026 demo, hindsight.vectorize.io docs, and the UMA
          (arXiv:2602.18493) and agent-memory systems characterization (arXiv:2606.06448) papers.
        </p>
        <div className="flex items-center gap-4 ml-auto">
          <a className="hover:text-ink transition-colors" href="https://github.com/vectorize-io/hindsight" target="_blank" rel="noreferrer">Upstream repo</a>
          <a className="hover:text-ink transition-colors" href="https://hindsight.vectorize.io/" target="_blank" rel="noreferrer">Docs</a>
          <Link className="hover:text-ink transition-colors" href="/sandbox">Sandbox</Link>
        </div>
      </div>
    </footer>
  );
}
