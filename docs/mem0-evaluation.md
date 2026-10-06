# Mem0 Docs — Evaluation & Tier-1 Implementation Slices

**Date:** 2026-10-06 · **Target:** extend `hindsight-sandbox` (Next.js App Router) · **Depth:** spec + starter code

Sources reviewed: 10 attached PDFs (How Mem0 Works, Respan, Visual Memory Retrieval, Entity-Scoped Memory,
Memory Evaluation, Graph Memory, Tag & Organize, Zapier, n8n, Integrations Overview) + 4 URL docs
(v2 Memory Filters, Update operation, LangGraph integration, Advanced Retrieval).

---

## 1. What Mem0 adds over what the sandbox already has

The sandbox already implements the Hindsight side of the design space: four networks, retain/recall/reflect,
entity+temporal+semantic+causal graph, RRF fusion, cross-encoder rerank, token-budget packing, observation
consolidation with evidence/proof counts, opinion reinforcement, tuning knobs, orchestration, benchmarks.

Mem0's docs emphasize a different center of gravity — **operational memory management** rather than reasoning:

| Theme | Mem0 concept | Sandbox today | Gap |
|---|---|---|---|
| Multi-tenancy | `user_id / agent_id / app_id / run_id` entity scoping, speaker attribution, scoped `delete_all`, wildcards | bank-level isolation only | **No sub-bank scoping** |
| Query layer | v2 filter DSL: nested `AND/OR/NOT`, `eq/ne/in/gt/gte/lt/lte/contains/icontains`, `*` wildcard, validated allow-list | tag/type filters in browser | **No structured filter language** |
| Write ops | `update`, `batch_update` (≤1000), immutable flag, timestamp override, per-memory audit | delete only (+ learning CRUD) | **No update/history** |
| Organization | project-level custom categories, auto-tagging by content semantics, re-categorization on update, `categories:{in:[…]}` | manual tags at retain | **No auto-categorization** |
| Write steering | `includes`/`excludes`, `custom_instructions`, `custom_categories` per call, `infer=False` verbatim mode | none | **No extraction steering** |
| Evaluation | open-source harness: structured per-question results, `top_k` cutoffs (10/50/200), mean tokens/query, judge config, run comparison UI | static published tables | **No runnable evals** |
| Retrieval signals | semantic + BM25 + entity-boost + temporal; rerank as an explicit toggle (quick vs precision path, +150–200 ms) | 4 arms + always-on rerank | rerank toggle missing |
| Graph | native entity store, schema-free co-occurrence links, query-entity ranking boost | entity links + graph arm | entity *store* is implicit — minor |
| Integrations | Zapier app, n8n community node, LangGraph pattern, Respan observability, MCP | orchestrator nodes | snippet/webhook emission missing |
| Multimodal | visual memory (images in conversations) — Platform-only | none | out of scope for now |

Note the architectural contrast worth surfacing in the UI: Mem0's current pipeline is **ADD-only extraction**
(old and new facts coexist; no silent rewriting) whereas Hindsight **consolidates** (observations refine, opinions
reinforce). The sandbox supports both once update/history ops land — that duality is a feature, not a conflict.

---

## 2. Tier-1 shortlist (implement now)

Scored impact/effort 1–5 (effort = cost, lower is better):

| # | Feature | Impact | Effort | Why Tier-1 |
|---|---|---|---|---|
| **S1** | Entity-scoped memory (`user_id/agent_id/app_id/run_id` + speaker attribution) | 5 | 2 | Unlocks multi-user/multi-agent demos; prerequisite for S2 filters and scoped deletes |
| **S2** | Memory Filters v2 DSL (engine + visual/JSON builder + validation) | 5 | 3 | The single biggest power-user lever; turns the browser and recall into a queryable store |
| **S3** | Memory operations: `update`, `batch_update`, revisions + audit trail | 4 | 2 | Completes the CRUD story; audit history makes knowledge-update behavior visible |
| **S4** | Auto-categorization (bank-level catalog, assign-on-retain, re-categorize on update) | 4 | 2 | Organizes large banks; composes with S2 (`categories:{in:[…]}`) |
| **S5** | Evaluation harness (runnable mini-benchmark, cutoffs, token efficiency, structured results, run history) | 5 | 3 | Converts the static Benchmarks page into a *live* efficiency instrument — core sandbox mission |
| **S6** | Retain steering (`includes`/`excludes`/`custom_instructions`/`infer=false` verbatim) + rerank toggle | 3 | 1 | Cheap, high-visibility control surface; teaches the extraction contract |

**Tier-2 backlog — ✅ ALL SHIPPED (2026-10-06):**
- ✅ **Write-path mode switch** — per-bank `Consolidating (Hindsight-style)` vs `ADD-only (Mem0-style)` in Context Tuning. ADD-only never overwrites: contradicting/updating facts get a `supersedes` link (entity overlap + update-cue detection), the temporal channel resolves recency at query time, and both records stay retrievable.
- ✅ **Integrations screen** (`/sandbox/integrations`) — REST/curl + Python/TS SDK snippets generated against the active bank, Zapier action→endpoint mapping with the async-extraction caveat, n8n community-node workflow skeleton (operations table, entity-scope requirement, OR-semantics), LangGraph recall→chatbot→retain node pattern, and a **working webhook emitter**: subscribe by URL + event topics (memory.retained / recalled / reflected, observation.changed, eval.completed, pipeline.run, `*`), every matching store event produces a simulated delivery with the exact POST payload, expandable delivery log.
- ✅ **Entity-overlap boost** — query entities ∩ memory entities, tanh-saturated, α slider (±), shown in the recall trace's combined-boost column.
- ✅ **TTL / expiration_date** — set in the Update dialog; expired memories skipped by recall unless `includeExpired` (audit mode); purge-expired via store action; badges in browser.
- ✅ **Feedback signals** — 👍/👎 on every memory row: 👍 raises access weight; 👎 flags `needs_review` and weakens related opinions (the docs' self-healing tip).

**Tier-3 — ✅ ALL SHIPPED (2026-10-06):**
- ✅ **Visual/multimodal memory** — attach an image at retain time: thumbnailed in-browser (≤256px JPEG data URL), caption field, simulated vision pass extracts elements from caption/filename; the memory becomes cross-modally retrievable (caption + elements are in the fact text, so all four arms see them). Thumbnails render in the browser rows and inspector with detected-element chips.
- ✅ **External observability export** — Integrations → Observability: OTel-shaped spans generated from the live event stream (per-app trace ids, latency + `gen_ai.usage.tokens` attributes), span preview table, JSONL/CSV downloads, metrics snapshot, eval-results export, full-workspace export, collector bridge snippet, and retain/recall/reflect token attribution (the construction-vs-read-path split from the systems study).
- ✅ **MCP server simulation** — Integrations → MCP Server: `tools/list` manifest (7 tools: retain_memory, recall_memory, reflect, search_observations, update_memory, delete_memory, list_entities) with JSON-Schema inputs, an interactive `tools/call` playground executing against live store state with real result envelopes (`{content:[{type:"text",…}], isError}`), and a host config snippet for MCP-compatible clients.
- ✅ **Dedicated entity-store view** — Memory → Entities: canonical entity index (degree, network mix, co-occurrence neighbors, first/last seen), search, click-through between co-occurring entities, linked-memory list, and the query-time boost signal each entity would contribute.

---

## 3. Implementation slices

### S1 · Entity-Scoped Memory
- **Types:** `MemoryFact.scopes = { userId, agentId, appId, runId }` (nullable strings).
- **Engine (retain):** speaker attribution — lines `User:` → `userId` (agentId null); `Assistant:` → `agentId` (userId null); `infer=false` verbatim records carry **both** ids (mirrors the documented behavior); `app_id`/`run_id` ride on every record.
- **Store:** `retain()` accepts scopes; `deleteScoped({userId?, runId?, …})` bulk delete; seed facts get scopes (`app: sandbox-demo`, `user: alice`, `agent: atlas`).
- **UI:** Retain panel scope inputs (4 fields); browser rows + inspector show scope chips; dashboard gets a scope-mix readout.
- **Acceptance:** retaining a user/assistant transcript attributes facts correctly; filtering by `run_id` then scoped-delete removes only that run; wildcard `*` matches non-null only.

### S2 · Memory Filters v2
- **Engine (`lib/engine/filters.ts`):** evaluator for nested `AND/OR/NOT`; fields `user_id, agent_id, app_id, run_id, created_at, updated_at, timestamp, text, categories, metadata, keywords, memory_ids, network, tags, confidence`; operators `eq, ne, in, gt, gte, lt, lte, contains, icontains`, bare values, `*` wildcard (non-null match); flat sibling keys implicitly ANDed; validator mimicking the platform's allow-list 400 message.
- **Recall integration:** `recall({filters})` pre-filters the candidate pool before the four arms run.
- **UI:** FilterBuilder component — visual rows (field/operator/value, AND/OR/NOT groups one level deep) ⇄ raw JSON mode with live validation; wired into Memory Browser and Recall panel.
- **Acceptance:** `{"AND":[{"user_id":"alice"},{"categories":{"in":["preferences"]}}]}` returns the intersection; unknown top-level key shows the allow-list error; `{"user_id":"*"}` excludes null-scope records.

### S3 · Update / Batch Update / Audit
- **Types:** `MemoryFact.history: { at, text, note }[]`, `immutable?: boolean`.
- **Store:** `updateFact(id, {text?, tags?, categories?, scopes?, immutable?})` → recomputes tokens/entities, appends revision; `batchUpdate(pairs)`; immutable memories refuse update (must delete + re-add).
- **UI:** inline edit dialog from the inspector; revision timeline ("previous → current"); batch mode via multi-select in the browser; events logged to the stream.
- **Acceptance:** updating text re-classifies entities and keeps id stable; immutable flag blocks update with a clear message; history renders in inspector.

### S4 · Auto-Categorization
- **Types:** `Bank.customCategories: {name, description}[]`; `MemoryFact.categories: string[]`.
- **Engine:** deterministic assignment — cosine(text, name+description) over the catalog, threshold 0.28, max 2 categories; re-run on `updateFact`.
- **UI:** catalog editor in Settings (or bank card); category chips on fact rows; category facet filter in browser; retain can pass per-call `custom_categories` override.
- **Acceptance:** default catalog (preferences, work, decisions, incidents, tooling, people) tags seed facts sensibly; changing a fact's text re-categorizes it.

### S5 · Evaluation Harness
- **Data (`lib/data/evalset.ts`):** ~14-question mini-benchmark generated around the seed storyline; groups: single-hop, multi-hop, temporal, knowledge-update, preference; each with ground-truth answer + gold memory hints.
- **Engine (`lib/engine/evaluate.ts`):** per question → recall at cutoffs `[5, 10, all]` with current settings; simulated judge = gold-token overlap over retrieved+reflected text → `CORRECT/INCORRECT`, score 0–1, reason string; records retrieval latency, tokens; aggregates `accuracy@cutoff`, mean tokens/query (the token-efficiency metric Mem0 stresses), p50 latency.
- **Store:** `evalRuns: EvalRun[]` with settings snapshot; runs comparable over time.
- **UI (`/sandbox/eval`):** New-run button, run history, headline cards (accuracy, tokens/query, p50), cutoff comparison bars, per-question drill-down showing the exact structured result JSON (retrieval / generation / judgment / cutoff_results), "contribute a benchmark" panel with the question-set schema + JSON import.
- **Acceptance:** a run completes client-side in <2 s, results match the documented structured format, changing tuning (e.g. budget low→high) measurably moves accuracy@k and tokens.

### S6 · Retain Steering + Rerank Toggle
- **Retain options:** `includes` / `excludes` free-text (keep/drop extracted facts by lexical match), `customInstructions` (logged + surfaced on the event), `infer=false` → single verbatim memory (no extraction, both scope ids set).
- **Recall settings:** `rerankEnabled` — off ⇒ skip cross-encoder, synthesize scores from RRF ranks spread over [0.1, 1.0] (matches the documented no-CE fallback), visible latency delta in the trace ("quick path" vs "precision path").
- **Acceptance:** includes="only food and diet" on the vegetarian+car+parking example stores only the dietary fact; toggling rerank changes trace latency and ordering but not the candidate set.

---

## 4. File map (this iteration)

```
lib/types.ts                        + scopes, categories, history, immutable, EvalRun, rerankEnabled
lib/engine/filters.ts               NEW  v2 filter DSL evaluator + validator
lib/engine/retain.ts                + speaker attribution, steering, verbatim, auto-categories
lib/engine/recall.ts                + filters pre-pass, rerank toggle w/ RRF-derived fallback
lib/engine/evaluate.ts              NEW  mini-benchmark runner + simulated judge
lib/data/evalset.ts                 NEW  seed question set + contribute-schema
lib/data/seed.ts                    + scopes/categories on seeds, default category catalog
lib/store.ts                        + updateFact/batchUpdate/deleteScoped/runEvaluation, settings
components/memory/FilterBuilder.tsx NEW  visual ⇄ JSON filter builder
app/sandbox/memory/page.tsx         + steering & scopes in Retain, filters/categories/update in Browser
app/sandbox/eval/page.tsx           NEW  evaluation runner UI
app/sandbox/context/page.tsx        + rerank toggle
components/shell/*                  + Evaluation nav & palette entries
docs/mem0-evaluation.md             this report
```
