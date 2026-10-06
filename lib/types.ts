/* ============================================================
   Core domain types — modeled on the Hindsight architecture:
   four networks (world / experience / observation / opinion),
   three operations (retain / recall / reflect), graph links,
   observations with evidence + trends, opinions with confidence.
   ============================================================ */

export type Network = "world" | "experience" | "observation" | "opinion";

export const NETWORKS: Network[] = ["world", "experience", "observation", "opinion"];

export type LinkType = "entity" | "temporal" | "semantic" | "causal";

export type CausalType = "causes" | "caused_by" | "enables" | "prevents";

export interface CausalRelation {
  targetFactIndex: number;
  relationType: CausalType;
  strength: number;
}

/** Entity scopes (Mem0-style): who/what/where a memory belongs. */
export interface MemoryScopes {
  userId: string | null;
  agentId: string | null;
  appId: string | null;
  runId: string | null;
}

export interface FactRevision {
  at: string;
  text: string;
  note: string;
}

/** A memory unit f = (u, b, t, v, τs, τe, τm, ℓ, c, x) from the paper. */
export interface MemoryFact {
  id: string;
  bankId: string;
  text: string;
  network: Network;
  entities: string[];
  occurredStart: string | null; // ISO date
  occurredEnd: string | null;
  mentionedAt: string; // ISO timestamp
  confidence?: number; // opinions only
  tokens: number;
  tags: string[];
  accessCount: number;
  causal: CausalRelation[];
  chunkRef?: string; // source material (for include_chunks)
  /* Mem0-inspired extensions */
  scopes: MemoryScopes;
  categories: string[];
  metadata: Record<string, string>;
  history: FactRevision[];
  immutable?: boolean;
  verbatim?: boolean; // stored with infer=false
  expiresAt?: string | null; // TTL — excluded from recall once past
  supersedes?: string | null; // ADD-only mode: id of the older fact this updates
  feedback?: { up: number; down: number };
  attachment?: MemoryAttachment | null; // visual/multimodal memory
}

export interface MemoryAttachment {
  kind: "image";
  dataUrl: string; // downscaled thumbnail data URL
  caption: string; // user-provided or vision-pass description
  fileName: string;
  detectedElements: string[]; // simulated vision pass output
}

export interface CategoryDef {
  name: string;
  description: string;
}

export interface ObservationEvidence {
  memoryId: string;
  quote: string;
  timestamp: string;
}

export type ObservationTrend = "new" | "strengthening" | "stable" | "weakening" | "stale";

export interface Observation {
  id: string;
  bankId: string;
  title: string;
  content: string;
  evidence: ObservationEvidence[];
  proofCount: number;
  trend: ObservationTrend;
  scope: string[]; // tag scope
  createdAt: string;
  updatedAt: string;
  history: { content: string; at: string }[];
}

export interface OpinionEvent {
  at: string;
  confidence: number;
  event: "formed" | "reinforced" | "weakened" | "contradicted" | "refined";
  note?: string;
}

export interface Opinion {
  id: string;
  bankId: string;
  text: string;
  confidence: number;
  formedAt: string;
  entities: string[];
  reasoning: string;
  history: OpinionEvent[];
}

export interface GraphLink {
  id: string;
  source: string; // fact id
  target: string; // fact id
  type: LinkType;
  weight: number;
  entity?: string;
  causalType?: CausalType;
}

export interface Directive {
  id: string;
  content: string;
  priority: number;
  active: boolean;
}

export interface Disposition {
  skepticism: number; // 1..5
  literalism: number; // 1..5
  empathy: number; // 1..5
}

export interface Bank {
  id: string;
  name: string;
  background: string; // first-person h
  disposition: Disposition;
  bias: number; // β 0..1
  directives: Directive[];
  createdAt: string;
  customCategories: CategoryDef[]; // auto-categorization catalog
  /** write-path mode: consolidate (Hindsight-style) or additive (Mem0-style ADD-only) */
  writeMode: "consolidate" | "additive";
}

/* ---------------- recall / tuning ---------------- */

export type Budget = "low" | "mid" | "high";

export interface RecallSettings {
  budget: Budget;
  budgetMode: "fixed" | "adaptive";
  maxTokens: number;
  rrfK: number;
  rerankerCap: number;
  rerankEnabled: boolean; // quick path (off) vs precision path (on)
  includeChunks: boolean;
  maxChunkTokens: number;
  boosts: { semantic: number; bm25: number; graph: number; temporal: number };
  recencyAlpha: number;
  temporalAlpha: number;
  proofAlpha: number;
  entityBoostAlpha: number; // query-entity overlap boost (Mem0-style entity signal)
  includeExpired: boolean; // recall memories past their expiration_date
  dedupThreshold: number;
  autoConsolidation: boolean;
  observationsMission: string;
  consolidationStrategies: string; // JSON text
  types: Network[];
}

/* ---------------- webhooks / integrations ---------------- */

export type WebhookEvent =
  | "memory.retained"
  | "memory.recalled"
  | "memory.reflected"
  | "observation.changed"
  | "eval.completed"
  | "pipeline.run"
  | "*";

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  at: string;
  webhookId: string;
  url: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  status: "simulated-200";
}

/* ---------------- filters v2 (Mem0-style DSL) ---------------- */

export type FilterValue = string | number | boolean | null | string[] | { [op: string]: unknown };
export interface FilterNode {
  AND?: FilterNode[];
  OR?: FilterNode[];
  NOT?: FilterNode | FilterNode[];
  [field: string]: unknown;
}

/* ---------------- evaluation harness ---------------- */

export type EvalGroup = "single-hop" | "multi-hop" | "temporal" | "knowledge-update" | "preference";

export interface EvalQuestion {
  id: string;
  group: EvalGroup;
  question: string;
  groundTruth: string;
  goldHints: string[]; // tokens/ids expected in retrieved context
}

export interface EvalQuestionResult {
  id: string;
  group: EvalGroup;
  question: string;
  ground_truth: string;
  retrieval: {
    search_query: string;
    search_results: string[];
    search_latency_ms: number;
    total_results: number;
  };
  judgment: {
    judgment: "CORRECT" | "INCORRECT";
    score: number;
    reason: string;
    model: string;
  };
  cutoff_results: Record<string, { score: number; judgment: "CORRECT" | "INCORRECT" }>;
}

export interface EvalRun {
  id: string;
  at: string;
  name: string;
  bankId: string;
  settingsSnapshot: { budget: Budget; maxTokens: number; rerankEnabled: boolean; rrfK: number };
  results: EvalQuestionResult[];
  accuracy: number; // @all
  accuracyByCutoff: Record<string, number>;
  meanTokens: number;
  p50LatencyMs: number;
}

/* ---------------- recall trace (for the transparent UI) ------- */

export interface ArmHit {
  factId: string;
  rank: number;
  score: number;
}

export interface RecallCandidate {
  fact: MemoryFact;
  observation?: Observation;
  arms: { semantic?: number; bm25?: number; graph?: number; temporal?: number };
  rrf: number;
  rerank: number;
  recencyBoost: number;
  temporalBoost: number;
  proofBoost: number;
  entityBoost: number;
  finalScore: number;
  included: boolean;
  tokens: number;
}

export interface TemporalWindow {
  start: string;
  end: string;
  label: string;
}

export interface RecallTrace {
  query: string;
  window: TemporalWindow | null;
  arms: {
    semantic: ArmHit[];
    bm25: ArmHit[];
    graph: ArmHit[];
    temporal: ArmHit[];
  };
  candidates: RecallCandidate[];
  selected: RecallCandidate[];
  tokensUsed: number;
  maxTokens: number;
  latencyMs: number;
  recallBudget: number;
}

/* ---------------- reflect ---------------- */

export interface ReflectResult {
  response: string;
  systemPrompt: string;
  verbalization: string;
  memories: RecallCandidate[];
  newOpinions: { text: string; confidence: number; reasoning: string }[];
  trace: RecallTrace;
}

/* ---------------- prompts ---------------- */

export interface PromptVersion {
  v: number;
  system: string;
  user: string;
  savedAt: string;
  note: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  system: string;
  user: string;
  variables: string[];
  disposition: Disposition;
  bias: number;
  versions: PromptVersion[];
  runs: { at: string; latencyMs: number; tokens: number; score: number }[];
}

/* ---------------- continuous learning (UMA-inspired) ----------- */

export interface LedgerEntry {
  id: string;
  date: string;
  category: string;
  scene: string;
  amount: number;
}

export interface LearningToolCall {
  at: string;
  tool: "memory_add" | "memory_update" | "memory_delete" | "memory_key_retrieve" | "memory_list" | "update_core" | "answer";
  args: Record<string, string | number>;
  result: string;
  ok: boolean;
}

export interface LearningEpisode {
  id: string;
  chunk: string;
  toolCalls: LearningToolCall[];
  coreMemoryAfter: string;
  judge: number; // 0..100
  em: number; // 0..100
}

export interface LearningState {
  memoryBank: { title: string; content: string }[];
  coreMemory: string;
  ledger: LedgerEntry[];
  episodes: LearningEpisode[];
  processedChunks: number;
}

/* ---------------- orchestrator ---------------- */

export type AppId =
  | "memory"
  | "prompts"
  | "context"
  | "learning"
  | "llm-router"
  | "datasource"
  | "evaluator"
  | "webhook";

export interface OrchestratorNode {
  id: string;
  appId: AppId;
  label: string;
  x: number;
  y: number;
  mounted: boolean;
  config: Record<string, string | number | boolean>;
}

export interface OrchestratorEdge {
  id: string;
  source: string;
  target: string;
  dataType: "facts" | "prompts" | "context" | "feedback" | "events";
  routing: "round-robin" | "priority" | "broadcast";
  active: boolean;
}

export interface AppMetrics {
  appId: AppId | string;
  label: string;
  ops: number;
  p50: number;
  p95: number;
  errorRate: number;
  throughput: number;
  series: number[]; // last N ops/sec samples
  status: "healthy" | "degraded" | "idle";
}

/* ---------------- events / ops log ---------------- */

export interface SandboxEvent {
  id: string;
  at: string;
  app: string;
  op: "retain" | "recall" | "reflect" | "consolidate" | "reinforce" | "learn" | "orchestrate" | "system";
  message: string;
  latencyMs?: number;
  tokens?: number;
}

/* ---------------- settings ---------------- */

export interface UiSettings {
  theme: "dark" | "light";
  accentHue: number;
  density: "cozy" | "compact";
  sidebarCollapsed: boolean;
  animations: boolean;
  gridOpacity: number;
  showTraceDetails: boolean;
}
