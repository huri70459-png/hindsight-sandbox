"use client";

/* ============================================================
   Global sandbox state (zustand + localStorage persistence).
   Holds banks, the four memory networks, graph links, recall
   settings, prompts, learning state, orchestrator graph,
   metrics, event log and UI settings.
   ============================================================ */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppId,
  AppMetrics,
  Bank,
  CategoryDef,
  EvalQuestion,
  EvalRun,
  FilterNode,
  GraphLink,
  LearningEpisode,
  LearningState,
  MemoryFact,
  MemoryScopes,
  Observation,
  Opinion,
  OrchestratorEdge,
  OrchestratorNode,
  PromptTemplate,
  RecallSettings,
  SandboxEvent,
  UiSettings,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
} from "@/lib/types";
import { countTokens, rng, uid } from "@/lib/utils";
import { buildSeedFacts, buildSeedLinks, DEFAULT_CATEGORIES, seedBank, seedBank2, seedObservations, seedOpinions, seedOpsSeries } from "@/lib/data/seed";
import { SEED_EVALSET } from "@/lib/data/evalset";
import { consolidateBank, markStale, invalidateForDeletedFact } from "@/lib/engine/consolidate";
import { reinforceOpinion, mergeBackground, findRelatedOpinions } from "@/lib/engine/reflect";
import { retain as doRetain, assignCategories, detectSuperseded } from "@/lib/engine/retain";
import { runEvaluation } from "@/lib/engine/evaluate";
import { recall as doRecall } from "@/lib/engine/recall";
import { extractEntities } from "@/lib/engine/nlp";

function extractEntitiesSafe(text: string): string[] {
  try {
    return extractEntities(text);
  } catch {
    return [];
  }
}

export const DEFAULT_RECALL_SETTINGS: RecallSettings = {
  budget: "mid",
  budgetMode: "fixed",
  maxTokens: 4096,
  rrfK: 60,
  rerankerCap: 300,
  rerankEnabled: true,
  includeChunks: false,
  maxChunkTokens: 2048,
  boosts: { semantic: 0, bm25: 0, graph: 0, temporal: 0 },
  recencyAlpha: 0.2,
  temporalAlpha: 0.2,
  proofAlpha: 0.1,
  entityBoostAlpha: 0.15,
  includeExpired: false,
  dedupThreshold: 0.97,
  autoConsolidation: true,
  observationsMission: "",
  consolidationStrategies: "[]",
  types: [],
};

export const DEFAULT_UI: UiSettings = {
  theme: "dark",
  accentHue: 257,
  density: "cozy",
  sidebarCollapsed: false,
  animations: true,
  gridOpacity: 0.6,
  showTraceDetails: true,
};

function defaultLearning(): LearningState {
  return {
    memoryBank: [
      { title: "Transport/2024-02", content: "Subway 2.90; Internet bill classified under Utilities (75.00)." },
      { title: "Utilities/2024-02", content: "Internet 75.00." },
    ],
    coreMemory:
      "The user tracks personal expenses by category with an assistant. Themes: dining, transport, utilities; amounts logged per date.",
    ledger: [
      { id: "l1", date: "2024-02-23", category: "Utilities", scene: "Internet", amount: 75.0 },
      { id: "l2", date: "2024-02-23", category: "Transportation", scene: "Subway", amount: 2.9 },
      { id: "l3", date: "2024-02-23", category: "Entertainment", scene: "Escape Room", amount: 40.0 },
      { id: "l4", date: "2024-02-23", category: "Education", scene: "Tuition", amount: 1500.0 },
      { id: "l5", date: "2024-02-23", category: "Transportation", scene: "Bus", amount: 1.5 },
      { id: "l6", date: "2024-04-29", category: "Transportation", scene: "Taxi", amount: 25.5 },
      { id: "l7", date: "2024-04-29", category: "Medical", scene: "Doctor Visit", amount: 50.0 },
      { id: "l8", date: "2024-04-29", category: "Utilities", scene: "Gas Bill", amount: 85.2 },
      { id: "l9", date: "2024-04-29", category: "Shopping", scene: "Cosmetics", amount: 120.0 },
    ],
    episodes: [],
    processedChunks: 2,
  };
}

function defaultNodes(): OrchestratorNode[] {
  return [
    { id: "n-src", appId: "datasource", label: "Interaction Stream", x: 60, y: 210, mounted: true, config: { rate: "5 msg/min" } },
    { id: "n-mem", appId: "memory", label: "Memory Bank · Atlas", x: 320, y: 110, mounted: true, config: { bank: "bank-demo" } },
    { id: "n-ctx", appId: "context", label: "Context Tuner", x: 320, y: 320, mounted: true, config: { budget: "mid" } },
    { id: "n-prompt", appId: "prompts", label: "Prompt Studio", x: 590, y: 110, mounted: true, config: { template: "reflect-default" } },
    { id: "n-llm", appId: "llm-router", label: "LLM Router", x: 590, y: 320, mounted: true, config: { model: "gpt-oss-20b" } },
    { id: "n-learn", appId: "learning", label: "Continuous Learner", x: 850, y: 210, mounted: true, config: { policy: "task-stratified" } },
  ];
}

function defaultEdges(): OrchestratorEdge[] {
  return [
    { id: "e1", source: "n-src", target: "n-mem", dataType: "facts", routing: "broadcast", active: true },
    { id: "e2", source: "n-mem", target: "n-prompt", dataType: "context", routing: "priority", active: true },
    { id: "e3", source: "n-ctx", target: "n-prompt", dataType: "context", routing: "round-robin", active: true },
    { id: "e4", source: "n-prompt", target: "n-llm", dataType: "prompts", routing: "broadcast", active: true },
    { id: "e5", source: "n-llm", target: "n-learn", dataType: "feedback", routing: "broadcast", active: true },
    { id: "e6", source: "n-learn", target: "n-mem", dataType: "events", routing: "priority", active: true },
  ];
}

function seedMetrics(): AppMetrics[] {
  const r = rng(42);
  const mk = (appId: AppId | string, label: string, ops: number, p50: number, status: AppMetrics["status"]): AppMetrics => ({
    appId,
    label,
    ops,
    p50,
    p95: Math.round(p50 * (1.8 + r())),
    errorRate: Number((r() * (status === "healthy" ? 0.6 : 2.4)).toFixed(2)),
    throughput: Number((ops / 3600 + r() * 0.4).toFixed(2)),
    series: Array.from({ length: 32 }, (_, i) =>
      Math.max(2, Math.round(ops / 90 + Math.sin(i / 2.6 + r() * 3) * ops * 0.012 + r() * ops * 0.008))
    ),
    status,
  });
  return [
    mk("memory", "Memory", 12840, 38, "healthy"),
    mk("prompts", "Prompt Studio", 3410, 22, "healthy"),
    mk("context", "Context Tuner", 5220, 12, "healthy"),
    mk("learning", "Continuous Learner", 890, 145, "degraded"),
    mk("orchestrator", "Orchestrator", 2100, 9, "healthy"),
  ];
}

export interface RetainOpts {
  tags?: string[];
  scopes?: Partial<Pick<MemoryScopes, "userId" | "agentId" | "appId" | "runId">>;
  includes?: string;
  excludes?: string;
  customInstructions?: string;
  metadata?: Record<string, string>;
  infer?: boolean;
  customCategories?: CategoryDef[];
  attachment?: import("@/lib/types").MemoryAttachment; // visual memory
}

export interface SandboxState {
  hydrated: boolean;
  banks: Bank[];
  activeBankId: string;
  facts: MemoryFact[];
  links: GraphLink[];
  observations: Observation[];
  opinions: Opinion[];
  consolidatedFactIds: string[];
  recallSettings: RecallSettings;
  prompts: PromptTemplate[];
  activePromptId: string;
  learning: LearningState;
  nodes: OrchestratorNode[];
  edges: OrchestratorEdge[];
  pipelineRuns: number;
  metrics: AppMetrics[];
  opsSeries: { t: number; retain: number; recall: number; reflect: number }[];
  events: SandboxEvent[];
  ui: UiSettings;
  evalRuns: EvalRun[];
  evalSets: { id: string; name: string; description: string; questions: EvalQuestion[] }[];
  webhooks: Webhook[];
  webhookDeliveries: WebhookDelivery[];

  // actions
  setHydrated: () => void;
  setActiveBank: (id: string) => void;
  createBank: (name: string, background: string) => string;
  updateBank: (id: string, patch: Partial<Bank>) => void;
  updateBankCategories: (bankId: string, cats: CategoryDef[]) => void;
  retain: (content: string, opts?: RetainOpts) => { factCount: number; steeredOut: number };
  updateFact: (id: string, patch: { text?: string; tags?: string[]; categories?: string[]; scopes?: Partial<MemoryScopes>; metadata?: Record<string, string>; note?: string }) => { ok: boolean; error?: string };
  batchUpdateFacts: (ids: string[], patch: { tags?: string[]; categories?: string[]; note?: string }) => number;
  toggleImmutable: (id: string) => void;
  deleteFact: (id: string) => void;
  deleteScoped: (scope: Partial<Pick<MemoryScopes, "userId" | "agentId" | "appId" | "runId">>) => number;
  runConsolidation: () => { created: number; updated: number; merged: number };
  addOpinion: (o: { text: string; confidence: number; reasoning: string; entities: string[] }) => void;
  reinforce: (opinionId: string, assessment: "reinforce" | "weaken" | "contradict", note?: string) => void;
  mergeBankBackground: (snippet: string) => { conflict: boolean };
  setRecallSettings: (patch: Partial<RecallSettings>) => void;
  resetRecallSettings: () => void;
  bumpAccess: (factIds: string[]) => void;
  recallWithFilters: (query: string, filters: FilterNode | null) => import("@/lib/types").RecallTrace;
  runEval: (name: string, setQuestions?: EvalQuestion[]) => EvalRun;
  importEvalSet: (json: string) => { ok: boolean; error?: string; name?: string };
  deleteEvalRun: (id: string) => void;
  addWebhook: (url: string, events: WebhookEvent[]) => void;
  removeWebhook: (id: string) => void;
  toggleWebhook: (id: string) => void;
  updateWebhookEvents: (id: string, events: WebhookEvent[]) => void;
  feedbackFact: (id: string, up: boolean) => void;
  setFactExpiration: (id: string, iso: string | null) => void;
  purgeExpired: () => number;

  addPrompt: (p: Omit<PromptTemplate, "id" | "versions" | "runs">) => string;
  updatePrompt: (id: string, patch: Partial<PromptTemplate>) => void;
  savePromptVersion: (id: string, note: string) => void;
  deletePrompt: (id: string) => void;
  logPromptRun: (id: string, run: { latencyMs: number; tokens: number; score: number }) => void;

  learningAdd: (title: string, content: string) => boolean;
  learningUpdate: (title: string, content: string, newTitle?: string) => boolean;
  learningDelete: (title: string) => boolean;
  learningEpisode: (ep: Omit<LearningEpisode, "id">) => void;
  learningReset: () => void;

  addNode: (appId: AppId, label: string, x: number, y: number) => string;
  moveNode: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, key: string, value: string | number | boolean) => void;
  toggleMount: (id: string) => void;
  connect: (source: string, target: string, dataType: OrchestratorEdge["dataType"]) => void;
  disconnect: (id: string) => void;
  updateEdge: (id: string, patch: Partial<OrchestratorEdge>) => void;
  recordRun: (bumpOps?: Record<string, number>) => void;

  logEvent: (e: Omit<SandboxEvent, "id" | "at">) => void;
  setUi: (patch: Partial<UiSettings>) => void;
  resetDemo: () => void;
  importState: (json: string) => boolean;
}

function initialEvents(): SandboxEvent[] {
  const t = Date.now();
  return [
    { id: "ev0", at: new Date(t - 4 * 60000).toISOString(), app: "memory", op: "consolidate", message: "Background consolidation refined 2 observations (Redis licensing, Vue migration)", latencyMs: 820 },
    { id: "ev1", at: new Date(t - 9 * 60000).toISOString(), app: "memory", op: "recall", message: "recall(query=\"What does Alice prefer?\", budget=mid, max_tokens=4096) → 5 memories, 612 tokens", latencyMs: 187, tokens: 612 },
    { id: "ev2", at: new Date(t - 14 * 60000).toISOString(), app: "memory", op: "retain", message: "retain(bank=Atlas) → 3 facts extracted (2 world, 1 experience)", latencyMs: 1240, tokens: 410 },
    { id: "ev3", at: new Date(t - 26 * 60000).toISOString(), app: "prompts", op: "system", message: "Prompt 'reflect-default' saved as v3", latencyMs: 4 },
    { id: "ev4", at: new Date(t - 41 * 60000).toISOString(), app: "learning", op: "learn", message: "Episode 12 completed — judge 87, EM 78, memory bank 6 entries", latencyMs: 2310 },
  ];
}

function seedPrompts(): PromptTemplate[] {
  return [
    {
      id: "tpl-reflect",
      name: "reflect-default",
      description: "Default preference-conditioned reflect prompt with disposition verbalization.",
      system:
        "You are {{agent_name}}.\nBackground: {{background}}\nBehavioral profile: {{disposition}}\n\nAnswer using ONLY recalled memories. Separate what you know from what you believe. Cite memory numbers.",
      user: "{{query}}",
      variables: ["agent_name", "background", "disposition", "query"],
      disposition: { skepticism: 3, literalism: 3, empathy: 4 },
      bias: 0.35,
      versions: [
        { v: 1, system: "You are a helpful assistant with memory.", user: "{{query}}", savedAt: new Date(Date.now() - 86400000 * 9).toISOString(), note: "initial" },
        { v: 2, system: "You are {{agent_name}}. Use recalled memories only.", user: "{{query}}", savedAt: new Date(Date.now() - 86400000 * 4).toISOString(), note: "grounding" },
      ],
      runs: [],
    },
    {
      id: "tpl-extract",
      name: "fact-extraction",
      description: "Narrative fact extraction with the five required dimensions (what/when/where/who/why).",
      system:
        "Extract facts from text into structured format with FIVE required dimensions — BE EXTREMELY DETAILED.\nFor EACH fact capture: 1) what 2) when (always include day of week) 3) where 4) who (with relationships) 5) why (emotions, motivations, nuance).\nResolve coreferences: link generic relations and names for the same person.\nClassify fact_type ∈ {world, experience, opinion}. Extract entities (PERSON, ORGANIZATION, LOCATION, PRODUCT, CONCEPT, OTHER) and causal relations.",
      user: "Reference time: {{now}}\n\nTranscript:\n{{transcript}}",
      variables: ["now", "transcript"],
      disposition: { skepticism: 3, literalism: 5, empathy: 3 },
      bias: 0.1,
      versions: [],
      runs: [],
    },
    {
      id: "tpl-opinion",
      name: "opinion-formation",
      description: "First-person opinion extraction with confidence scores from reflect answers.",
      system:
        "Extract any NEW opinions from the answer below and rewrite them in FIRST-PERSON as if YOU are stating them.\nAn opinion is a judgment or viewpoint beyond stating facts. Do NOT extract 'I don't have enough information' statements.\nALWAYS start with: I think… / I believe… / In my view… / I've come to believe…\nInclude reasoning naturally and a confidence score 0.0–1.0.",
      user: "ORIGINAL QUESTION:\n{{query}}\n\nANSWER PROVIDED:\n{{answer}}",
      variables: ["query", "answer"],
      disposition: { skepticism: 3, literalism: 3, empathy: 3 },
      bias: 0.5,
      versions: [],
      runs: [],
    },
    {
      id: "tpl-observation",
      name: "observation-synthesis",
      description: "Preference-neutral entity summaries from underlying facts (3–7 observations).",
      system:
        "You are an objective observer synthesizing facts about an entity. Generate clear, factual observations without opinions or behavioral profile influence.\nRules: objective, third person, combine related facts, note the most recent when facts conflict. Generate 3–7 observations.",
      user: "Based on the following facts about \"{{entity_name}}\", generate a list of key observations.\n\nFACTS:\n{{facts_text}}",
      variables: ["entity_name", "facts_text"],
      disposition: { skepticism: 3, literalism: 4, empathy: 2 },
      bias: 0,
      versions: [],
      runs: [],
    },
  ];
}

function initialFacts(): MemoryFact[] {
  return buildSeedFacts("bank-demo");
}

export const useSandbox = create<SandboxState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      banks: [seedBank, seedBank2],
      activeBankId: "bank-demo",
      facts: initialFacts(),
      links: buildSeedLinks(initialFacts()),
      observations: seedObservations,
      opinions: seedOpinions,
      consolidatedFactIds: initialFacts().slice(0, 14).map((f) => f.id),
      recallSettings: DEFAULT_RECALL_SETTINGS,
      prompts: seedPrompts(),
      activePromptId: "tpl-reflect",
      learning: defaultLearning(),
      nodes: defaultNodes(),
      edges: defaultEdges(),
      pipelineRuns: 128,
      metrics: seedMetrics(),
      opsSeries: seedOpsSeries(),
      events: initialEvents(),
      ui: DEFAULT_UI,
      evalRuns: [],
      evalSets: [{ id: "set-seed", name: "Seed storyline (built-in)", description: "14 questions across 5 groups generated around the demo bank's memories.", questions: SEED_EVALSET }],
      webhooks: [
        {
          id: "wh-demo",
          url: "https://hooks.example.dev/sandbox-events",
          events: ["memory.retained", "observation.changed"],
          active: false,
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
      ],
      webhookDeliveries: [],

      setHydrated: () => set({ hydrated: true }),
      setActiveBank: (id) => set({ activeBankId: id }),

      createBank: (name, background) => {
        const id = uid("bank");
        const bank: Bank = {
          id,
          name,
          background,
          disposition: { skepticism: 3, literalism: 3, empathy: 3 },
          bias: 0.3,
          directives: [],
          createdAt: new Date().toISOString(),
          customCategories: DEFAULT_CATEGORIES,
          writeMode: "consolidate",
        };
        set((s) => ({ banks: [...s.banks, bank], activeBankId: id }));
        get().logEvent({ app: "memory", op: "system", message: `Bank "${name}" created` });
        return id;
      },

      updateBank: (id, patch) =>
        set((s) => ({ banks: s.banks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),

      retain: (content, opts) => {
        const s = get();
        const bankId = s.activeBankId;
        const bank = s.banks.find((b) => b.id === bankId);
        const { facts, links, steeredOut, verbatim } = doRetain(content, {
          bankId,
          tags: opts?.tags ?? [],
          scopes: opts?.scopes ?? { appId: "sandbox-local" },
          includes: opts?.includes,
          excludes: opts?.excludes,
          customInstructions: opts?.customInstructions,
          metadata: opts?.metadata,
          infer: opts?.infer,
          customCategories: opts?.customCategories,
          bankCategories: bank?.customCategories ?? DEFAULT_CATEGORIES,
        });
        // visual memory: attach the image to the first extracted fact
        if (opts?.attachment && facts.length) {
          facts[0] = { ...facts[0], attachment: opts.attachment };
        }
        let observations = s.observations;
        let consolidatedFactIds = s.consolidatedFactIds;
        let consMsg = "";
        const additive = bank?.writeMode === "additive";

        if (additive) {
          // ADD-only mode: nothing is overwritten or consolidated. Detect which
          // older facts each new fact supersedes so knowledge-update queries
          // stay answerable while both records survive.
          const withSupersede = facts.map((f) => ({
            ...f,
            supersedes: detectSuperseded(f, s.facts),
          }));
          const supCount = withSupersede.filter((f) => f.supersedes).length;
          set({ facts: [...s.facts, ...withSupersede], links: [...s.links, ...links] });
          if (supCount) consMsg = ` · additive mode: ${supCount} fact(s) linked via supersedes (old records preserved)`;
          get().logEvent({
            app: "memory",
            op: "retain",
            message: `retain(bank=${bank?.name ?? bankId}, mode=additive) → ${facts.length} facts appended${consMsg}`,
            latencyMs: Math.round(300 + facts.length * 160 + Math.random() * 200),
            tokens: facts.reduce((a, f) => a + f.tokens, 0) + countTokens(content),
          });
          return { factCount: facts.length, steeredOut };
        }

        if (s.recallSettings.autoConsolidation && !verbatim) {
          const res = consolidateBank([...s.facts, ...facts], s.observations, new Set(s.consolidatedFactIds), {
            dedupThreshold: s.recallSettings.dedupThreshold,
            mission: s.recallSettings.observationsMission,
          });
          observations = res.observations;
          consolidatedFactIds = res.consolidatedFactIds;
          if (res.created.length || res.updated.length || res.merged.length) {
            consMsg = ` · consolidation: +${res.created.length} created, ${res.updated.length} refined, ${res.merged.length} merged`;
          }
        } else if (!verbatim) {
          observations = markStale(s.observations, [...s.facts, ...facts], new Set(s.consolidatedFactIds));
        }

        // opinion reinforcement for related opinions
        let opinions = s.opinions;
        for (const f of facts) {
          const related = findRelatedOpinions(f, opinions);
          if (related.length) {
            const contradicts = /\b(not anymore|no longer|switched|actually|instead|correction)\b/i.test(f.text);
            opinions = opinions.map((o) =>
              related.some((r) => r.id === o.id)
                ? reinforceOpinion(o, contradicts ? "contradict" : "reinforce", 0.08, `New fact retained: ${f.text.slice(0, 60)}…`)
                : o
            );
          }
        }

        set({
          facts: [...s.facts, ...facts],
          links: [...s.links, ...links],
          observations,
          opinions,
          consolidatedFactIds,
        });
        const steerMsg = steeredOut ? ` · ${steeredOut} fact(s) steered out by includes/excludes` : "";
        const verbatimMsg = verbatim ? " (infer=false — stored verbatim, both scope ids set)" : "";
        get().logEvent({
          app: "memory",
          op: "retain",
          message: `retain(bank=${bank?.name ?? bankId}) → ${facts.length} facts extracted${steerMsg}${verbatimMsg}${consMsg}${opts?.customInstructions ? ` · instructions: "${opts.customInstructions.slice(0, 40)}…"` : ""}`,
          latencyMs: Math.round(400 + facts.length * 220 + Math.random() * 300),
          tokens: facts.reduce((a, f) => a + f.tokens, 0) + countTokens(content),
        });
        return { factCount: facts.length, steeredOut };
      },

      updateFact: (id, patch) => {
        const s = get();
        const fact = s.facts.find((f) => f.id === id);
        if (!fact) return { ok: false, error: "Memory not found" };
        if (fact.immutable) return { ok: false, error: "Memory is immutable — delete and re-add it instead." };
        const bank = s.banks.find((b) => b.id === fact.bankId);
        const newText = patch.text ?? fact.text;
        const updated: MemoryFact = {
          ...fact,
          text: newText,
          tokens: countTokens(newText),
          entities: patch.text ? extractEntitiesSafe(newText) : fact.entities,
          categories: patch.categories ?? (patch.text ? assignCategories(newText, bank?.customCategories ?? DEFAULT_CATEGORIES) : fact.categories),
          tags: patch.tags ?? fact.tags,
          scopes: patch.scopes ? { ...fact.scopes, ...patch.scopes } : fact.scopes,
          metadata: patch.metadata ?? fact.metadata,
          history: [...fact.history, { at: new Date().toISOString(), text: fact.text, note: patch.note ?? "update" }].slice(-8),
        };
        set({ facts: s.facts.map((f) => (f.id === id ? updated : f)) });
        get().logEvent({ app: "memory", op: "system", message: `memory_update(${id.slice(0, 14)}…) — re-categorized, revision #${updated.history.length} stored` });
        return { ok: true };
      },

      batchUpdateFacts: (ids, patch) => {
        const s = get();
        let n = 0;
        const nowIso = new Date().toISOString();
        set({
          facts: s.facts.map((f) => {
            if (!ids.includes(f.id) || f.immutable) return f;
            n++;
            return {
              ...f,
              tags: patch.tags ?? f.tags,
              categories: patch.categories ?? f.categories,
              history: [...f.history, { at: nowIso, text: f.text, note: patch.note ?? "batch_update" }].slice(-8),
            };
          }),
        });
        get().logEvent({ app: "memory", op: "system", message: `batch_update → ${n} memories modified (immutable skipped)` });
        return n;
      },

      toggleImmutable: (id) => {
        set((s) => ({ facts: s.facts.map((f) => (f.id === id ? { ...f, immutable: !f.immutable } : f)) }));
      },

      deleteScoped: (scope) => {
        const s = get();
        const doomed = s.facts.filter((f) =>
          Object.entries(scope).every(([k, v]) => v == null || f.scopes?.[k as keyof MemoryScopes] === v)
        );
        if (!doomed.length) return 0;
        const ids = new Set(doomed.map((f) => f.id));
        let observations = s.observations;
        for (const id of ids) {
          observations = invalidateForDeletedFact(observations, id).observations;
        }
        set({
          facts: s.facts.filter((f) => !ids.has(f.id)),
          links: s.links.filter((l) => !ids.has(l.source) && !ids.has(l.target)),
          observations,
          consolidatedFactIds: s.consolidatedFactIds.filter((f) => !ids.has(f)),
        });
        get().logEvent({ app: "memory", op: "system", message: `delete_all(${JSON.stringify(scope)}) → ${ids.size} memories removed` });
        return ids.size;
      },

      deleteFact: (id) => {
        const s = get();
        const { observations, removed } = invalidateForDeletedFact(s.observations, id);
        set({
          facts: s.facts.filter((f) => f.id !== id),
          links: s.links.filter((l) => l.source !== id && l.target !== id),
          observations,
          consolidatedFactIds: s.consolidatedFactIds.filter((f) => f !== id),
        });
        get().logEvent({ app: "memory", op: "system", message: `Memory deleted · ${removed} derived observation(s) removed, sources reset for re-consolidation` });
      },

      runConsolidation: () => {
        const s = get();
        const res = consolidateBank(s.facts, s.observations, new Set(s.consolidatedFactIds), {
          dedupThreshold: s.recallSettings.dedupThreshold,
          mission: s.recallSettings.observationsMission,
        });
        set({ observations: res.observations, consolidatedFactIds: res.consolidatedFactIds });
        get().logEvent({
          app: "memory",
          op: "consolidate",
          message: `Manual consolidation → ${res.created.length} created, ${res.updated.length} refined, ${res.merged.length} near-duplicates merged`,
          latencyMs: Math.round(600 + res.created.length * 300),
        });
        return { created: res.created.length, updated: res.updated.length, merged: res.merged.length };
      },

      addOpinion: (o) => {
        const s = get();
        const opinion: Opinion = {
          id: uid("op"),
          bankId: s.activeBankId,
          text: o.text,
          confidence: o.confidence,
          formedAt: new Date().toISOString(),
          entities: o.entities,
          reasoning: o.reasoning,
          history: [{ at: new Date().toISOString(), confidence: o.confidence, event: "formed" }],
        };
        set({ opinions: [...s.opinions, opinion] });
        get().logEvent({ app: "memory", op: "reflect", message: `Opinion formed (c=${o.confidence.toFixed(2)}): ${o.text.slice(0, 70)}…` });
      },

      reinforce: (opinionId, assessment, note) => {
        const s = get();
        set({
          opinions: s.opinions.map((o) => (o.id === opinionId ? reinforceOpinion(o, assessment, 0.1, note) : o)),
        });
        get().logEvent({ app: "memory", op: "reinforce", message: `Opinion ${assessment}d (α=0.1)` });
      },

      mergeBankBackground: (snippet) => {
        const s = get();
        const bank = s.banks.find((b) => b.id === s.activeBankId)!;
        const { merged, conflict } = mergeBackground(bank.background, snippet);
        get().updateBank(bank.id, { background: merged });
        get().logEvent({ app: "memory", op: "system", message: `Background merged${conflict ? " (conflict resolved in favor of new info)" : ""}` });
        return { conflict };
      },

      setRecallSettings: (patch) => set((s) => ({ recallSettings: { ...s.recallSettings, ...patch } })),
      resetRecallSettings: () => set({ recallSettings: DEFAULT_RECALL_SETTINGS }),

      bumpAccess: (factIds) =>
        set((s) => ({
          facts: s.facts.map((f) => (factIds.includes(f.id) ? { ...f, accessCount: f.accessCount + 1 } : f)),
        })),

      updateBankCategories: (bankId, cats) => {
        set((s) => ({ banks: s.banks.map((b) => (b.id === bankId ? { ...b, customCategories: cats } : b)) }));
        get().logEvent({ app: "memory", op: "system", message: `Category catalog updated (${cats.length} categories) — future retains auto-tag against it` });
      },

      recallWithFilters: (query, filters) => {
        const s = get();
        const facts = s.facts.filter((f) => f.bankId === s.activeBankId);
        const trace = doRecall({
          query,
          facts,
          links: s.links,
          observations: s.observations.filter((o) => o.bankId === s.activeBankId),
          opinions: s.opinions.filter((o) => o.bankId === s.activeBankId),
          settings: s.recallSettings,
          filters,
        });
        return trace;
      },

      runEval: (name, setQuestions) => {
        const s = get();
        const questions = setQuestions ?? s.evalSets[0]?.questions ?? SEED_EVALSET;
        const run = runEvaluation({
          questions,
          facts: s.facts.filter((f) => f.bankId === s.activeBankId),
          links: s.links,
          observations: s.observations.filter((o) => o.bankId === s.activeBankId),
          opinions: s.opinions.filter((o) => o.bankId === s.activeBankId),
          settings: s.recallSettings,
          runName: name,
          bankId: s.activeBankId,
        });
        set({ evalRuns: [run, ...s.evalRuns].slice(0, 40) });
        get().logEvent({
          app: "evaluation",
          op: "system",
          message: `Eval run "${name}" — accuracy ${run.accuracy}% @all, top_5 ${run.accuracyByCutoff["top_5"]}%, mean ${run.meanTokens} tok/query`,
          latencyMs: run.p50LatencyMs,
          tokens: run.meanTokens,
        });
        return run;
      },

      importEvalSet: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed?.name || !Array.isArray(parsed?.questions) || !parsed.questions.length)
            return { ok: false, error: "Expected { name, description?, questions: [{ id, group, question, groundTruth, goldHints }] }" };
          const groups = ["single-hop", "multi-hop", "temporal", "knowledge-update", "preference"];
          for (const q of parsed.questions) {
            if (!q.id || !q.question || !q.groundTruth || !Array.isArray(q.goldHints))
              return { ok: false, error: `Question "${q.id ?? "?"}" is missing required fields` };
            if (!groups.includes(q.group)) return { ok: false, error: `Question "${q.id}": unknown group "${q.group}"` };
          }
          const s = get();
          set({
            evalSets: [
              ...s.evalSets,
              { id: uid("set"), name: parsed.name, description: parsed.description ?? "Imported set", questions: parsed.questions },
            ],
          });
          get().logEvent({ app: "evaluation", op: "system", message: `Benchmark set "${parsed.name}" imported (${parsed.questions.length} questions)` });
          return { ok: true, name: parsed.name };
        } catch (e) {
          return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
        }
      },

      deleteEvalRun: (id) => set((s) => ({ evalRuns: s.evalRuns.filter((r) => r.id !== id) })),

      /* ---------- integrations: webhooks ---------- */

      addWebhook: (url, events) => {
        const wh: Webhook = { id: uid("wh"), url, events, active: true, createdAt: new Date().toISOString() };
        set((s) => ({ webhooks: [...s.webhooks, wh] }));
        get().logEvent({ app: "integrations", op: "system", message: `Webhook subscribed: ${url} [${events.join(", ")}]` });
      },
      removeWebhook: (id) => set((s) => ({ webhooks: s.webhooks.filter((w) => w.id !== id) })),
      toggleWebhook: (id) =>
        set((s) => ({ webhooks: s.webhooks.map((w) => (w.id === id ? { ...w, active: !w.active } : w)) })),
      updateWebhookEvents: (id, events) =>
        set((s) => ({ webhooks: s.webhooks.map((w) => (w.id === id ? { ...w, events } : w)) })),

      /* ---------- feedback signals ---------- */

      feedbackFact: (id, up) => {
        const s = get();
        const fact = s.facts.find((f) => f.id === id);
        if (!fact) return;
        set({
          facts: s.facts.map((f) =>
            f.id === id
              ? {
                  ...f,
                  feedback: { up: (f.feedback?.up ?? 0) + (up ? 1 : 0), down: (f.feedback?.down ?? 0) + (up ? 0 : 1) },
                  metadata: up ? f.metadata : { ...f.metadata, needs_review: "1" },
                }
              : f
          ),
        });
        // 👎 weakens related opinions — self-healing hook from the docs' tip
        if (!up) {
          const related = findRelatedOpinions(fact, s.opinions);
          if (related.length) {
            set({
              opinions: s.opinions.map((o) =>
                related.some((r) => r.id === o.id)
                  ? reinforceOpinion(o, "weaken", 0.06, `Negative feedback on supporting memory ${id.slice(0, 12)}…`)
                  : o
              ),
            });
          }
        }
        get().logEvent({
          app: "memory",
          op: "system",
          message: `feedback(${up ? "👍" : "👎"}) on memory ${id.slice(0, 12)}…${up ? " — access weight raised" : " — flagged needs_review, related opinions weakened"}`,
        });
      },

      /* ---------- expiration / TTL ---------- */

      setFactExpiration: (id, iso) => {
        set((s) => ({ facts: s.facts.map((f) => (f.id === id ? { ...f, expiresAt: iso } : f)) }));
        get().logEvent({ app: "memory", op: "system", message: iso ? `expiration_date set → ${iso.slice(0, 10)}` : "expiration_date cleared" });
      },

      purgeExpired: () => {
        const s = get();
        const nowIso = new Date().toISOString();
        const doomed = s.facts.filter((f) => f.expiresAt && f.expiresAt < nowIso);
        if (!doomed.length) return 0;
        const ids = new Set(doomed.map((f) => f.id));
        let observations = s.observations;
        for (const id of ids) observations = invalidateForDeletedFact(observations, id).observations;
        set({
          facts: s.facts.filter((f) => !ids.has(f.id)),
          links: s.links.filter((l) => !ids.has(l.source) && !ids.has(l.target)),
          observations,
          consolidatedFactIds: s.consolidatedFactIds.filter((f) => !ids.has(f)),
        });
        get().logEvent({ app: "memory", op: "system", message: `Purged ${ids.size} expired memories (retention policy)` });
        return ids.size;
      },

      addPrompt: (p) => {
        const id = uid("tpl");
        set((s) => ({ prompts: [...s.prompts, { ...p, id, versions: [], runs: [] }], activePromptId: id }));
        get().logEvent({ app: "prompts", op: "system", message: `Prompt template "${p.name}" created` });
        return id;
      },

      updatePrompt: (id, patch) =>
        set((s) => ({ prompts: s.prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

      savePromptVersion: (id, note) => {
        const s = get();
        const p = s.prompts.find((x) => x.id === id);
        if (!p) return;
        const v = (p.versions.at(-1)?.v ?? 0) + 1;
        get().updatePrompt(id, {
          versions: [...p.versions, { v, system: p.system, user: p.user, savedAt: new Date().toISOString(), note }],
        });
        get().logEvent({ app: "prompts", op: "system", message: `Prompt "${p.name}" saved as v${v}` });
      },

      deletePrompt: (id) =>
        set((s) => ({
          prompts: s.prompts.filter((p) => p.id !== id),
          activePromptId: s.activePromptId === id ? s.prompts.find((p) => p.id !== id)?.id ?? "" : s.activePromptId,
        })),

      logPromptRun: (id, run) =>
        set((s) => ({
          prompts: s.prompts.map((p) => (p.id === id ? { ...p, runs: [...p.runs, { at: new Date().toISOString(), ...run }].slice(-50) } : p)),
        })),

      learningAdd: (title, content) => {
        const s = get().learning;
        if (s.memoryBank.some((e) => e.title === title)) return false;
        set((st) => ({ learning: { ...st.learning, memoryBank: [...st.learning.memoryBank, { title, content }] } }));
        get().logEvent({ app: "learning", op: "learn", message: `memory_add("${title}")` });
        return true;
      },
      learningUpdate: (title, content, newTitle) => {
        const s = get().learning;
        if (!s.memoryBank.some((e) => e.title === title)) return false;
        set((st) => ({
          learning: {
            ...st.learning,
            memoryBank: st.learning.memoryBank.map((e) =>
              e.title === title ? { title: newTitle ?? e.title, content } : e
            ),
          },
        }));
        get().logEvent({ app: "learning", op: "learn", message: `memory_update("${title}")` });
        return true;
      },
      learningDelete: (title) => {
        const s = get().learning;
        if (!s.memoryBank.some((e) => e.title === title)) return false;
        set((st) => ({ learning: { ...st.learning, memoryBank: st.learning.memoryBank.filter((e) => e.title !== title) } }));
        get().logEvent({ app: "learning", op: "learn", message: `memory_delete("${title}")` });
        return true;
      },
      learningEpisode: (ep) => {
        set((st) => ({
          learning: {
            ...st.learning,
            episodes: [...st.learning.episodes, { ...ep, id: uid("ep") }],
            processedChunks: st.learning.processedChunks + 1,
          },
        }));
        get().logEvent({ app: "learning", op: "learn", message: `Episode ${get().learning.episodes.length} — judge ${ep.judge}, EM ${ep.em}`, latencyMs: Math.round(800 + Math.random() * 1500) });
      },
      learningReset: () => {
        set({ learning: defaultLearning() });
        get().logEvent({ app: "learning", op: "system", message: "Learning state reset" });
      },

      addNode: (appId, label, x, y) => {
        const id = uid("n");
        set((s) => ({ nodes: [...s.nodes, { id, appId, label, x, y, mounted: true, config: {} }] }));
        get().logEvent({ app: "orchestrator", op: "orchestrate", message: `Node mounted: ${label}` });
        return id;
      },
      moveNode: (id, x, y) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) })),
      removeNode: (id) =>
        set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id), edges: s.edges.filter((e) => e.source !== id && e.target !== id) })),
      updateNodeConfig: (id, key, value) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)) })),
      toggleMount: (id) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, mounted: !n.mounted } : n)) })),
      connect: (source, target, dataType) => {
        if (source === target) return;
        const s = get();
        if (s.edges.some((e) => e.source === source && e.target === target)) return;
        set({ edges: [...s.edges, { id: uid("e"), source, target, dataType, routing: "broadcast", active: true }] });
        get().logEvent({ app: "orchestrator", op: "orchestrate", message: `Wired ${source} → ${target} (${dataType})` });
      },
      disconnect: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
      updateEdge: (id, patch) => set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      recordRun: (bumpOps) => {
        set((s) => {
          const r = rng(Date.now() % 100000);
          return {
            pipelineRuns: s.pipelineRuns + 1,
            metrics: s.metrics.map((m) => {
              const bump = bumpOps?.[m.appId] ?? 0;
              return {
                ...m,
                ops: m.ops + bump + Math.round(r() * 5),
                p50: Math.max(4, Math.round(m.p50 * (0.94 + r() * 0.12))),
                p95: Math.max(m.p50, Math.round(m.p95 * (0.94 + r() * 0.12))),
                errorRate: Number(Math.max(0, m.errorRate + (r() - 0.55) * 0.15).toFixed(2)),
                series: [...m.series.slice(1), Math.max(2, Math.round(m.series.at(-1)! * (0.8 + r() * 0.5)))],
                status: m.errorRate > 2 ? "degraded" : "healthy",
              };
            }),
          };
        });
      },

      logEvent: (e) =>
        set((s) => {
          const event: SandboxEvent = { ...e, id: uid("ev"), at: new Date().toISOString() };
          // webhook fan-out: map the internal event onto subscription topics
          const topic: WebhookEvent =
            e.app === "memory" && e.op === "retain" ? "memory.retained"
            : e.app === "memory" && e.op === "recall" ? "memory.recalled"
            : e.app === "memory" && e.op === "reflect" ? "memory.reflected"
            : e.op === "consolidate" ? "observation.changed"
            : e.app === "evaluation" ? "eval.completed"
            : e.app === "orchestrator" && e.message.startsWith("Pipeline run") ? "pipeline.run"
            : "*";
          const deliveries: WebhookDelivery[] = s.webhooks
            .filter((w) => w.active && (w.events.includes(topic) || w.events.includes("*")))
            .map((w) => ({
              id: uid("dlv"),
              at: event.at,
              webhookId: w.id,
              url: w.url,
              event: topic === "*" ? "memory.retained" : topic,
              payload: {
                event: topic,
                at: event.at,
                bank_id: s.activeBankId,
                app: event.app,
                op: event.op,
                message: event.message,
                latency_ms: event.latencyMs ?? null,
                tokens: event.tokens ?? null,
              },
              status: "simulated-200" as const,
            }));
          return {
            events: [event, ...s.events].slice(0, 120),
            webhookDeliveries: [...deliveries, ...s.webhookDeliveries].slice(0, 60),
          };
        }),

      setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

      resetDemo: () => {
        const facts = initialFacts();
        set({
          banks: [seedBank, seedBank2],
          activeBankId: "bank-demo",
          facts,
          links: buildSeedLinks(facts),
          observations: seedObservations,
          opinions: seedOpinions,
          consolidatedFactIds: facts.slice(0, 14).map((f) => f.id),
          recallSettings: DEFAULT_RECALL_SETTINGS,
          prompts: seedPrompts(),
          activePromptId: "tpl-reflect",
          learning: defaultLearning(),
          nodes: defaultNodes(),
          edges: defaultEdges(),
          metrics: seedMetrics(),
          opsSeries: seedOpsSeries(),
          events: initialEvents(),
          evalRuns: [],
          evalSets: [{ id: "set-seed", name: "Seed storyline (built-in)", description: "14 questions across 5 groups generated around the demo bank's memories.", questions: SEED_EVALSET }],
          webhooks: [],
          webhookDeliveries: [],
        });
        get().logEvent({ app: "system", op: "system", message: "Demo data reset to seed state" });
      },

      importState: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== "object") return false;
          set(parsed as Partial<SandboxState>);
          get().logEvent({ app: "system", op: "system", message: "State imported from JSON" });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "hindsight-sandbox-v1",
      version: 3,
      partialize: (s) => {
        // persist everything except transient hydration flag
        const { hydrated, ...rest } = s;
        void hydrated;
        return rest;
      },
      migrate: (persisted, version) => {
        const state = persisted as Partial<SandboxState>;
        if (version < 2) {
          state.facts = (state.facts ?? []).map((f) => ({
            ...f,
            scopes: f.scopes ?? { userId: null, agentId: null, appId: "sandbox-local", runId: null },
            categories: f.categories ?? [],
            metadata: f.metadata ?? {},
            history: f.history ?? [],
          }));
          state.banks = (state.banks ?? []).map((b) => ({
            ...b,
            customCategories: b.customCategories?.length ? b.customCategories : DEFAULT_CATEGORIES,
          }));
          state.recallSettings = {
            ...DEFAULT_RECALL_SETTINGS,
            ...(state.recallSettings ?? {}),
          };
          if (!state.evalSets?.length) {
            state.evalSets = [{ id: "set-seed", name: "Seed storyline (built-in)", description: "14 questions across 5 groups generated around the demo bank's memories.", questions: SEED_EVALSET }];
          }
          state.evalRuns = state.evalRuns ?? [];
        }
        if (version < 3) {
          // Tier-2: write modes, entity boost, TTL, feedback, webhooks
          state.banks = (state.banks ?? []).map((b) => ({ ...b, writeMode: b.writeMode ?? "consolidate" }));
          state.facts = (state.facts ?? []).map((f) => ({
            ...f,
            expiresAt: f.expiresAt ?? null,
            supersedes: f.supersedes ?? null,
            feedback: f.feedback ?? undefined,
          }));
          state.recallSettings = {
            ...DEFAULT_RECALL_SETTINGS,
            ...(state.recallSettings ?? {}),
            entityBoostAlpha: state.recallSettings?.entityBoostAlpha ?? DEFAULT_RECALL_SETTINGS.entityBoostAlpha,
            includeExpired: state.recallSettings?.includeExpired ?? false,
          } as RecallSettings;
          state.webhooks = state.webhooks ?? [];
          state.webhookDeliveries = state.webhookDeliveries ?? [];
        }
        return state as SandboxState;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

/** convenience selectors */
export const useActiveBank = () =>
  useSandbox((s) => s.banks.find((b) => b.id === s.activeBankId) ?? s.banks[0]);
export const useBankFacts = (bankId: string) => useSandbox((s) => s.facts.filter((f) => f.bankId === bankId));
export const useBankObservations = (bankId: string) => useSandbox((s) => s.observations.filter((o) => o.bankId === bankId));
export const useBankOpinions = (bankId: string) => useSandbox((s) => s.opinions.filter((o) => o.bankId === bankId));
