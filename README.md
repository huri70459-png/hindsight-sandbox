# Hindsight Sandbox

**An open-source (MIT) Next.js App Router sandbox for mounting, wiring and orchestrating agent-memory apps** — a fully client-side study environment whose UI and architecture are inspired by [hindsight.vectorize.io](https://hindsight.vectorize.io/) and the Hindsight technical report.

Everything runs in the browser. No backend, no API keys, no LLM calls, no tracking. The memory engine is a deterministic TypeScript simulation of the published architecture, so you can watch every stage of the pipeline — fact extraction, graph links, four-arm retrieval, rank fusion, reranking, token packing, consolidation, opinion reinforcement — with full traces.

```
npm install
npm run dev        # → http://localhost:3000
```

---

## What's inside

### Landing page (`/`)
A marketing/docs-style front page in the spirit of the reference site: animated live memory graph hero, headline benchmark bars vs. next-best systems, the coding-agent cost/corrections scatter, the retain → recall → reflect model, four-network memory types, the multi-strategy retrieval pipeline diagram, and a showcase of the six sandbox apps.

### The Sandbox (`/sandbox`) — an app-router workspace with six mountable apps

| App | Route | What it does |
|---|---|---|
| **Dashboard** | `/sandbox` | Tier-1 fleet view: KPIs (memories, observations, opinions, links, recall p50, tokens), 48h ops timeline, four-network donut, per-stage latency structure, app-health cards with sparklines, live event stream. |
| **Memory** | `/sandbox/memory` | The full Hindsight loop: **Retain** transcripts (narrative extraction, entity resolution, 4 link types), **Browser** with network filters + inspector, interactive **Graph** canvas, **Recall** with a complete pipeline trace (4 arms → RRF → cross-encoder → boosts → token packing), **Reflect** with disposition-shaped, cited answers and opinion formation, **Observations** (evidence quotes, proof counts, freshness trends, evolution history) and **Opinions** (confidence trajectories, reinforce/weaken/contradict). |
| **Prompt Studio** | `/sandbox/prompts` | Versioned templates with `{{variables}}`, live resolved previews, A/B compare, test runs scored against the active bank, disposition sliders (S/L/E/β) that verbalize into the system prompt, directives, and background merging with conflict resolution. |
| **Context Tuning** | `/sandbox/context` | Every retrieval/consolidation knob: budget (low/mid/high) in fixed or adaptive mode, `max_tokens`, chunk budgets, RRF *k*, reranker cap, per-arm strategy boosts, recency/temporal/proof alphas, dedup threshold, auto-consolidation, observations mission, consolidation strategies (JSON, validated live), type filters — plus a live pipeline preview and the four recommended presets. |
| **Continuous Learning** | `/sandbox/learning` | A UMA-style loop: chunks stream in, a policy maintains a CRUD memory bank (`memory_add/update/delete/list`), core memory evolves via `update_core`, and Ledger-QA episodes grade latent-state tracking (judge + EM) with learning-curve charts. |
| **Orchestrator** | `/sandbox/orchestrator` | The node-graph canvas: mount any of 8 node types (the four apps + LLM Router, Data Source, Evaluator, Webhook), drag/zoom/pan, wire typed edges (`facts`, `prompts`, `context`, `feedback`, `events`) port-to-port, pick routing strategies (broadcast / round-robin / priority), run the pipeline with animated packets, and monitor per-node efficiency (ops, p50/p95, error rate, sparklines). |
| **Evaluation** | `/sandbox/eval` | A runnable benchmark harness (Mem0-style): recall at top_5/top_10/all cutoffs, deterministic judging with reasons, token-efficiency accounting, structured per-question results in the published format, run history with A/B comparison, and a "contribute a benchmark" JSON importer. |
| **Benchmarks** | `/sandbox/benchmarks` | Published results, sortable and cross-filtered: headline retrieval accuracy, LongMemEval per-category matrix, LoCoMo, Ledger-QA horizons (H=2…500), UMA family averages, and the ten-system construction–serve–accuracy frontier with energy-per-correct-answer. |
| **Settings** | `/sandbox/settings` | Max customization: dark/light theme, accent hue (0–360°) with presets, density, animations, grid opacity, sidebar state, verbose traces, JSON export/import of the entire workspace, demo reset, bank identity editing. |

Plus: **⌘K / Ctrl+K command palette**, bank switcher in the top bar, collapsible sidebar, and full localStorage persistence (theme applies before first paint — no flash).

### Mem0-inspired operational layer (added after the Mem0 docs review)

- **Entity-scoped memory** — `user_id / agent_id / app_id / run_id` on every fact, with speaker attribution on the extraction path (user lines → user_id, assistant lines → agent_id; `infer=false` verbatim records carry both) and scoped bulk delete.
- **Memory Filters v2** — nested `AND/OR/NOT` DSL with `eq/ne/in/gt/gte/lt/lte/contains/icontains`, `*` wildcards, implicit flat-AND, strict allow-list validation — editable via a visual builder or raw JSON, applied in the browser and before recall arms run.
- **Update / batch update / audit** — `memory_update` with revision history (previous text preserved), immutable flag (delete + re-add), re-categorization on update.
- **Auto-categorization** — bank-level category catalog; retains auto-tag facts by content semantics; category facets in the browser.
- **Extraction steering** — per-call `includes` / `excludes` / `custom_instructions`, and `infer=false` verbatim storage.
- **Rerank toggle** — quick path (RRF-derived scores) vs precision path (cross-encoder), with visible latency delta.
- **Evaluation harness** — see the Evaluation app above.

### Tier-2 layer (shipped)

- **Write-path modes** — per-bank switch between Consolidating (Hindsight-style refine/reinforce) and ADD-only (Mem0-style: never overwrite; `supersedes` links; recency resolved at query time).
- **Integrations app** (`/sandbox/integrations`) — REST/SDK/Zapier/n8n/LangGraph snippet generators keyed to the active bank, plus a webhook subscription manager with simulated deliveries and an expandable POST-payload log.
- **Entity-overlap boost** — tanh-saturated query-entity signal with its own α, visible in recall traces.
- **TTL** — `expiration_date` per memory; expired records excluded from recall unless audit mode; purge action.
- **Feedback signals** — 👍/👎 per memory; negatives flag `needs_review` and weaken related opinions.

### Tier-3 layer (shipped)

- **Visual memory** — attach images at retain (in-browser thumbnailing + caption + simulated vision pass); cross-modally retrievable, thumbnails in browser/inspector.
- **Observability export** — OTel-shaped spans from the event stream, JSONL/CSV/metrics/eval exports, collector bridge snippet, token attribution by operation.
- **MCP server simulation** — 7-tool manifest + interactive `tools/call` playground executing against live state with real MCP result envelopes.
- **Entity store** — dedicated Entities tab: canonical index with degree, network mix, co-occurrence graph navigation and boost-signal preview.

See [`docs/mem0-evaluation.md`](./docs/mem0-evaluation.md) for the full feature evaluation and implementation slices.

---

## Architecture

```
app/                      # Next.js App Router
  page.tsx                # landing (server component)
  sandbox/                # workspace shell + 6 app routes
components/
  ui.tsx                  # design-system primitives (zero deps beyond clsx)
  charts.tsx              # hand-rolled SVG charts: line, bars, donut, gauge, scatter, histogram
  landing/                # hero graph + landing sections
  memory/                 # MemoryGraph canvas + RecallTraceView
  shell/                  # sidebar/topbar layout, command palette, theme bootstrap
lib/
  types.ts                # domain model (facts, observations, opinions, links, traces, filters, evals…)
  engine/
    nlp.ts                # hashed embeddings, BM25, temporal parser, entities, CE proxy
    retain.ts             # narrative extraction + attribution/scoping + steering + auto-categories + links
    recall.ts             # filters pre-pass → 4-arm retrieval → RRF → rerank (toggleable) → boosts → packing
    reflect.ts            # disposition verbalization, grounded answers, opinion reinforcement
    consolidate.ts        # observations: evidence, proof counts, trends, near-dup reconciliation
    filters.ts            # Mem0-style v2 filter DSL: evaluator + validator
    evaluate.ts           # benchmark runner: cutoffs, deterministic judge, token efficiency
  data/                   # seed storyline + benchmark datasets + eval question sets (sources cited in-app)
  store.ts                # zustand + persist (v2 migration): single source of truth for the whole sandbox
```

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · zustand · lucide-react. Charts and the node-graph canvas are dependency-free SVG.

### Design tokens
Theming is driven entirely by CSS variables (`--bg`, `--surface`, `--accent`, `--world`, `--experience`, `--observation`, `--opinion`, …) exposed through Tailwind's `@theme`. The accent hue is a single `--h` variable, which is how Settings can re-skin the whole app live.

---

## Sources & inspiration

| Source | Used for |
|---|---|
| [Hindsight Technical Report (arXiv:2512.12818)](https://arxiv.org/abs/2512.12818) | Four networks, retain/recall/reflect, TEMPR pipeline math (RRF, boosts, spreading activation), CARA dispositions & opinion reinforcement, LongMemEval/LoCoMo tables |
| [ACL 2026 demo (2026.acl-demo.27)](https://aclanthology.org/2026.acl-demo.27/) | System framing, schemas, demo flow (inspection → retrieval walkthrough → opinion evolution → benchmark explorer) |
| [hindsight.vectorize.io](https://hindsight.vectorize.io/) docs (Recall / Observations pages) | UI structure & design language, recall tuning tables, observation consolidation lifecycle, dedup thresholds, scopes & strategies, headline benchmark figures |
| [UMA (arXiv:2602.18493)](https://arxiv.org/abs/2602.18493) | Continuous Learning app: CRUD memory bank, core memory, Task-Stratified GRPO explainer, Ledger-QA horizons |
| [Agent Memory systems characterization (arXiv:2606.06448)](https://arxiv.org/abs/2606.06448) | Benchmarks app: paradigm taxonomy, construction/energy tables, frontier scatter |

This project is **not affiliated with Vectorize.io**. It re-displays published benchmark figures for study and re-implements the described architecture as an in-browser simulation with original code and copy. The real, production system lives at [github.com/vectorize-io/hindsight](https://github.com/vectorize-io/hindsight).

## License

MIT — see [LICENSE](./LICENSE).
