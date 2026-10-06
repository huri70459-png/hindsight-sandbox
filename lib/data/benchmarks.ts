/* ============================================================
   Benchmark datasets — figures transcribed from the reviewed
   papers and the Hindsight docs site (sources cited in the UI):
   • Hindsight Technical Report (arXiv:2512.12818)
   • ACL 2026 demo paper (2026.acl-demo.27)
   • UMA / Ledger-QA (arXiv:2602.18493)
   • Agent Memory systems characterization (arXiv:2606.06448)
   • hindsight.vectorize.io benchmark section
   ============================================================ */

export interface BenchmarkRow {
  system: string;
  values: Record<string, number | null>;
  ours?: boolean;
}

/* ---- LongMemEval (S setting, 500 questions) — Table 3 of arXiv:2512.12818 ---- */
export const longMemEvalCategories = [
  "single-session-user",
  "single-session-assistant",
  "single-session-preference",
  "knowledge-update",
  "temporal-reasoning",
  "multi-session",
  "Overall",
] as const;

export const longMemEvalRows: BenchmarkRow[] = [
  { system: "Full-context (GPT-4o)", values: { "single-session-user": 81.4, "single-session-assistant": 94.6, "single-session-preference": 20.0, "knowledge-update": 78.2, "temporal-reasoning": 45.1, "multi-session": 44.3, Overall: 60.2 } },
  { system: "Full-context (OSS-20B)", values: { "single-session-user": 38.6, "single-session-assistant": 80.4, "single-session-preference": 20.0, "knowledge-update": 60.3, "temporal-reasoning": 31.6, "multi-session": 21.1, Overall: 39.0 } },
  { system: "Zep (GPT-4o)", values: { "single-session-user": 92.9, "single-session-assistant": 80.4, "single-session-preference": 56.7, "knowledge-update": 83.3, "temporal-reasoning": 62.4, "multi-session": 57.9, Overall: 71.2 } },
  { system: "Supermemory (GPT-4o)", values: { "single-session-user": 97.1, "single-session-assistant": 96.4, "single-session-preference": 70.0, "knowledge-update": 88.5, "temporal-reasoning": 76.7, "multi-session": 71.4, Overall: 81.6 } },
  { system: "Supermemory (GPT-5)", values: { "single-session-user": 97.1, "single-session-assistant": 100.0, "single-session-preference": 76.7, "knowledge-update": 87.2, "temporal-reasoning": 81.2, "multi-session": 75.2, Overall: 84.6 } },
  { system: "Supermemory (Gemini-3)", values: { "single-session-user": 98.6, "single-session-assistant": 98.2, "single-session-preference": 70.0, "knowledge-update": 89.7, "temporal-reasoning": 82.0, "multi-session": 76.7, Overall: 85.2 } },
  { system: "Hindsight (OSS-20B)", values: { "single-session-user": 95.7, "single-session-assistant": 94.6, "single-session-preference": 66.7, "knowledge-update": 84.6, "temporal-reasoning": 79.7, "multi-session": 79.7, Overall: 83.6 }, ours: true },
  { system: "Hindsight (OSS-120B)", values: { "single-session-user": 100.0, "single-session-assistant": 98.2, "single-session-preference": 86.7, "knowledge-update": 92.3, "temporal-reasoning": 85.7, "multi-session": 81.2, Overall: 89.0 }, ours: true },
  { system: "Hindsight (Gemini-3)", values: { "single-session-user": 97.1, "single-session-assistant": 96.4, "single-session-preference": 80.0, "knowledge-update": 94.9, "temporal-reasoning": 91.0, "multi-session": 87.2, Overall: 91.4 }, ours: true },
];

/* ---- LoCoMo — Table 4 of arXiv:2512.12818 ---- */
export const locomoCategories = ["Single-Hop", "Multi-Hop", "Open Domain", "Temporal", "Overall"] as const;

export const locomoRows: BenchmarkRow[] = [
  { system: "Backboard", values: { "Single-Hop": 89.36, "Multi-Hop": 75.0, "Open Domain": 91.2, Temporal: 91.9, Overall: 90.0 } },
  { system: "Memobase (v0.0.37)", values: { "Single-Hop": 70.92, "Multi-Hop": 46.88, "Open Domain": 77.17, Temporal: 85.05, Overall: 75.78 } },
  { system: "Zep", values: { "Single-Hop": 74.11, "Multi-Hop": 66.04, "Open Domain": 67.71, Temporal: 79.79, Overall: 75.14 } },
  { system: "Mem0-Graph", values: { "Single-Hop": 65.71, "Multi-Hop": 47.19, "Open Domain": 75.71, Temporal: 58.13, Overall: 68.44 } },
  { system: "Mem0", values: { "Single-Hop": 67.13, "Multi-Hop": 51.15, "Open Domain": 72.93, Temporal: 55.51, Overall: 66.88 } },
  { system: "LangMem", values: { "Single-Hop": 62.23, "Multi-Hop": 47.92, "Open Domain": 71.12, Temporal: 23.43, Overall: 58.1 } },
  { system: "OpenAI", values: { "Single-Hop": 63.79, "Multi-Hop": 42.92, "Open Domain": 62.29, Temporal: 21.71, Overall: 52.9 } },
  { system: "Hindsight (OSS-20B)", values: { "Single-Hop": 74.11, "Multi-Hop": 64.58, "Open Domain": 90.96, Temporal: 76.32, Overall: 83.18 }, ours: true },
  { system: "Hindsight (OSS-120B)", values: { "Single-Hop": 76.79, "Multi-Hop": 62.5, "Open Domain": 93.68, Temporal: 79.44, Overall: 85.67 }, ours: true },
  { system: "Hindsight (Gemini-3)", values: { "Single-Hop": 86.17, "Multi-Hop": 70.83, "Open Domain": 95.12, Temporal: 83.8, Overall: 89.61 }, ours: true },
];

/* ---- headline retrieval accuracy — hindsight.vectorize.io ---- */
export const siteBenchmarks: { name: string; hindsight: number; nextBest: number | null; nextBestLabel?: string }[] = [
  { name: "LongMemEval-S", hindsight: 94.6, nextBest: 74.0 },
  { name: "LoCoMo", hindsight: 92.0, nextBest: 80.3 },
  { name: "PersonaMem", hindsight: 86.6, nextBest: 84.4 },
  { name: "PrecisionMemBench", hindsight: 85.7, nextBest: null, nextBestLabel: "no published comparison" },
  { name: "LifeBench", hindsight: 71.5, nextBest: 61.0 },
  { name: "BEAM · 10M tokens", hindsight: 64.1, nextBest: 40.6 },
];

/* ---- coding agents scatter — hindsight.vectorize.io ---- */
export const codingAgents: { name: string; correctionsPerTask: number; costPerTask: number; ours?: boolean }[] = [
  { name: "Claude Code", correctionsPerTask: 0.85, costPerTask: 0.25 },
  { name: "Codex CLI", correctionsPerTask: 0.36, costPerTask: 0.35 },
  { name: "opencode", correctionsPerTask: 0.47, costPerTask: 0.5 },
  { name: "with memory layer", correctionsPerTask: 0.8, costPerTask: 0.7, ours: true },
];

/* ---- Ledger-QA per-horizon (LLM-as-a-Judge) — arXiv:2602.18493 Table 16 ---- */
export const ledgerHorizons = [2, 5, 10, 20, 30, 40, 50, 100, 500];

export const ledgerQA: { method: string; scores: number[]; ours?: boolean }[] = [
  { method: "Concat", scores: [63.11, 24.39, 21.36, 8.82, 7.77, 12.38, 12.38, 7.69, 1.92] },
  { method: "RAG", scores: [80.58, 39.02, 21.36, 17.65, 13.59, 15.24, 10.48, 8.65, 5.77] },
  { method: "MemAgent", scores: [81.55, 55.28, 42.72, 39.22, 39.81, 32.38, 32.38, 29.81, 11.54] },
  { method: "A-MEM", scores: [33.01, 24.39, 19.42, 11.76, 10.68, 8.57, 8.57, 0.96, 1.92] },
  { method: "Mem-α", scores: [60.19, 37.4, 34.95, 21.57, 18.45, 16.19, 22.86, 14.42, 9.62] },
  { method: "UMA-Generalist (16k)", scores: [73.79, 52.85, 42.72, 30.39, 36.89, 29.52, 44.76, 21.15, 11.54], ours: true },
  { method: "UMA-Specialist (16k)", scores: [87.38, 63.41, 63.11, 57.84, 53.4, 46.67, 45.71, 34.62, 25.0], ours: true },
];

/* ---- systems characterization — arXiv:2606.06448 Table 3 (Qwen3-32B, n=300) ---- */
export interface SystemsRow {
  system: string;
  paradigm: string;
  accuracy: number;
  wallTime: string;
  calls: number;
  totalKJ: number;
  joulesPerCorrect: number;
}

export const systemsStudy: SystemsRow[] = [
  { system: "BM25", paradigm: "II · Flat RAG", accuracy: 47.0, wallTime: "16.3m", calls: 300, totalKJ: 582, joulesPerCorrect: 4128 },
  { system: "embedRAG", paradigm: "II · Flat RAG", accuracy: 39.8, wallTime: "14.4m", calls: 610, totalKJ: 495, joulesPerCorrect: 4144 },
  { system: "GraphRAG", paradigm: "III.a · Struct RAG", accuracy: 46.0, wallTime: "1.83h", calls: 3215, totalKJ: 2082, joulesPerCorrect: 15084 },
  { system: "HippoRAG v2", paradigm: "III.a · Struct RAG", accuracy: 44.3, wallTime: "44.2m", calls: 2743, totalKJ: 1339, joulesPerCorrect: 10079 },
  { system: "Mem0", paradigm: "III.b · Consolidating", accuracy: 32.0, wallTime: "4.02h", calls: 4538, totalKJ: 4878, joulesPerCorrect: 50813 },
  { system: "SimpleMem", paradigm: "III.b · Consolidating", accuracy: 36.0, wallTime: "3.92h", calls: 4447, totalKJ: 5481, joulesPerCorrect: 50749 },
  { system: "A-Mem", paradigm: "IV · Agentic", accuracy: 42.7, wallTime: "11.76h", calls: 19230, totalKJ: 14864, joulesPerCorrect: 116116 },
  { system: "Letta", paradigm: "IV · Agentic", accuracy: 27.7, wallTime: "14.36h", calls: 18394, totalKJ: 15429, joulesPerCorrect: 185873 },
  { system: "MIRIX", paradigm: "IV · Agentic", accuracy: 20.0, wallTime: "6.03h", calls: 7655, totalKJ: 8678, joulesPerCorrect: 144629 },
];

/* ---- construction–serve–accuracy frontier (arXiv:2606.06448 Fig. 7a) ---- */
export const frontier: { system: string; buildS: number; serveS: number; accuracy: number }[] = [
  { system: "BM25", buildS: 1, serveS: 7.4, accuracy: 55.8 },
  { system: "embedRAG", buildS: 4, serveS: 5.2, accuracy: 50.3 },
  { system: "HippoRAG_v2", buildS: 277, serveS: 3.6, accuracy: 47.4 },
  { system: "GraphRAG", buildS: 2850, serveS: 4.3, accuracy: 47.0 },
  { system: "A-Mem", buildS: 17666, serveS: 2.6, accuracy: 42.1 },
  { system: "SimpleMem", buildS: 14000, serveS: 18.4, accuracy: 36.2 },
  { system: "MIRIX", buildS: 21000, serveS: 6.1, accuracy: 31.7 },
  { system: "Mem0", buildS: 4108, serveS: 2.2, accuracy: 26.8 },
  { system: "Letta", buildS: 48000, serveS: 13.1, accuracy: 25.9 },
];

/* ---- UMA benchmark averages (arXiv:2602.18493 Table 1, Judge) ---- */
export const umaMain: { method: string; ttl: number; ar: number; ours?: boolean }[] = [
  { method: "Concat", ttl: 64.8, ar: 43.6 },
  { method: "RAG", ttl: 47.4, ar: 56.6 },
  { method: "MemAgent", ttl: 32.5, ar: 55.5 },
  { method: "A-MEM", ttl: 56.8, ar: 59.7 },
  { method: "Mem-α", ttl: 70.8, ar: 59.4 },
  { method: "Mem-T", ttl: 40.8, ar: 54.0 },
  { method: "UMA-Generalist (16k)", ttl: 82.7, ar: 70.0, ours: true },
  { method: "UMA-Generalist (32k)", ttl: 85.7, ar: 70.6, ours: true },
];

export const benchmarkSources = [
  { id: "hindsight-report", label: "Hindsight Technical Report", href: "https://arxiv.org/abs/2512.12818" },
  { id: "acl-demo", label: "ACL 2026 System Demo", href: "https://aclanthology.org/2026.acl-demo.27/" },
  { id: "uma", label: "UMA · Task-Stratified GRPO + Ledger-QA", href: "https://arxiv.org/abs/2602.18493" },
  { id: "systems", label: "Agent Memory Systems Characterization", href: "https://arxiv.org/abs/2606.06448" },
  { id: "site", label: "hindsight.vectorize.io", href: "https://hindsight.vectorize.io/" },
];
