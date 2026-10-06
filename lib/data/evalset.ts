/* ============================================================
   Mini evaluation set — questions generated around the seed
   storyline so runs exercise every retrieval channel. Groups
   mirror LongMemEval/LoCoMo families. Also defines the schema
   for user-contributed benchmark sets.
   ============================================================ */

import type { EvalQuestion } from "@/lib/types";

export const SEED_EVALSET: EvalQuestion[] = [
  {
    id: "eval_q_001",
    group: "single-hop",
    question: "Where does Alice work?",
    groundTruth: "Google, on the research team in Mountain View",
    goldHints: ["Google", "Mountain View", "research"],
  },
  {
    id: "eval_q_002",
    group: "single-hop",
    question: "What caching technology did the team debug?",
    groundTruth: "Redis — eviction policy misconfigured, fixed with allkeys-lru",
    goldHints: ["Redis", "caching", "eviction"],
  },
  {
    id: "eval_q_003",
    group: "preference",
    question: "Which programming language does Alice prefer for data work?",
    groundTruth: "Python, because of the data science ecosystem",
    goldHints: ["Python", "prefer", "data"],
  },
  {
    id: "eval_q_004",
    group: "preference",
    question: "What frontend framework does Alice use now?",
    groundTruth: "Vue — she switched away from React",
    goldHints: ["Vue", "React", "switched"],
  },
  {
    id: "eval_q_005",
    group: "multi-hop",
    question: "Which company did Alice work at before Google?",
    groundTruth: "Microsoft, building ranking services for Bing",
    goldHints: ["Microsoft", "Bing"],
  },
  {
    id: "eval_q_006",
    group: "multi-hop",
    question: "Why should new OSS-constrained projects consider Valkey?",
    groundTruth: "Redis moved to SSPL; Valkey forked it under BSD",
    goldHints: ["Valkey", "BSD", "SSPL"],
  },
  {
    id: "eval_q_007",
    group: "temporal",
    question: "When did Alice join Google?",
    groundTruth: "March 2026",
    goldHints: ["March 2026", "joined"],
  },
  {
    id: "eval_q_008",
    group: "temporal",
    question: "What did the team start learning last spring for the payments rewrite?",
    groundTruth: "Rust, for its memory safety guarantees",
    goldHints: ["Rust", "payments rewrite", "spring"],
  },
  {
    id: "eval_q_009",
    group: "knowledge-update",
    question: "What is the current license status of Redis?",
    groundTruth: "Changed to SSPL (previously BSD)",
    goldHints: ["SSPL", "license"],
  },
  {
    id: "eval_q_010",
    group: "knowledge-update",
    question: "What playlist name did the team finally choose?",
    groundTruth: "Beach Beats, chosen over Sunset Sessions",
    goldHints: ["Beach Beats"],
  },
  {
    id: "eval_q_011",
    group: "single-hop",
    question: "Who did the agent recommend for the ML platform rotation?",
    groundTruth: "Alice, after reviewing her retrieval work",
    goldHints: ["Alice", "ML platform", "recommended"],
  },
  {
    id: "eval_q_012",
    group: "multi-hop",
    question: "What code style practices does Alice recommend?",
    groundTruth: "Type hints on public functions; she dislikes verbose code",
    goldHints: ["type hints", "verbose"],
  },
  {
    id: "eval_q_013",
    group: "preference",
    question: "What does the bank believe about Python for data science?",
    groundTruth: "Opinion: Python is the best general-purpose language for data science (confidence tracked)",
    goldHints: ["Python", "data science", "pandas"],
  },
  {
    id: "eval_q_014",
    group: "temporal",
    question: "What feedback did the onboarding workshop collect about Rust?",
    groundTruth: "Compile times frustrated the team",
    goldHints: ["Rust", "compile times", "workshop"],
  },
];

/** schema shown in the "contribute a benchmark" panel */
export const CONTRIB_SCHEMA = `{
  "name": "my-eval-set",
  "description": "Questions for the support-agent bank",
  "questions": [
    {
      "id": "q_001",
      "group": "single-hop | multi-hop | temporal | knowledge-update | preference",
      "question": "What is the refund window?",
      "groundTruth": "30 days from purchase",
      "goldHints": ["refund", "30 days"]
    }
  ]
}`;
