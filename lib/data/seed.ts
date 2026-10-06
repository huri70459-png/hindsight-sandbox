/* ============================================================
   Seed data — a demo memory bank with a small storyline so every
   screen has something meaningful to show on first launch.
   ============================================================ */

import type { Bank, GraphLink, MemoryFact, Observation, Opinion } from "@/lib/types";
import { countTokens } from "@/lib/utils";
import { buildLinks, assignCategories } from "@/lib/engine/retain";

const now = Date.now();
const daysAgo = (d: number, h = 10) => new Date(now - d * 86400000 - h * 3600000).toISOString();

export const DEFAULT_CATEGORIES: { name: string; description: string }[] = [
  { name: "preferences", description: "User likes, dislikes, tool and language preferences, personal choices" },
  { name: "work", description: "Jobs, teams, projects, employment history, workplace decisions and tasks" },
  { name: "decisions", description: "Choices made by the team, final decisions, adopted plans and their rationale" },
  { name: "incidents", description: "Outages, bugs, debugging sessions, fixes, operational problems" },
  { name: "tooling", description: "Software, libraries, licenses, infrastructure and technology evaluations" },
  { name: "people", description: "Individuals, relationships, roles, hiring, mentorship and social events" },
];

export const seedBank: Bank = {
  id: "bank-demo",
  name: "Atlas",
  background:
    "I am Atlas, a research assistant for a small ML team. I track the team's projects, preferences, and decisions across sessions.",
  disposition: { skepticism: 3, literalism: 3, empathy: 4 },
  bias: 0.35,
  directives: [
    { id: "dir1", content: "Never expose internal salary information.", priority: 10, active: true },
    { id: "dir2", content: "Prefer citing observation-level knowledge over raw facts when both exist.", priority: 5, active: true },
  ],
  createdAt: daysAgo(40),
  customCategories: DEFAULT_CATEGORIES,
  writeMode: "consolidate",
};

export const seedBank2: Bank = {
  id: "bank-analyst",
  name: "Skeptic",
  background: "I am a data analyst assistant. I double-check claims and ask for evidence before agreeing.",
  disposition: { skepticism: 5, literalism: 4, empathy: 2 },
  bias: 0.6,
  directives: [{ id: "dir3", content: "Always state the confidence of an answer.", priority: 8, active: true }],
  createdAt: daysAgo(21),
  customCategories: DEFAULT_CATEGORIES,
  writeMode: "consolidate",
};


interface SeedFact {
  text: string;
  network: MemoryFact["network"];
  entities: string[];
  day: number;
  confidence?: number;
  tags?: string[];
}

const storyline: SeedFact[] = [
  {
    text: "Alice joined Google in March 2026, working on the research team in Mountain View focusing on retrieval systems.",
    network: "world",
    entities: ["Alice", "Google", "Mountain View"],
    day: 38,
    tags: ["user:alice"],
  },
  {
    text: "Alice previously worked at Microsoft until January 2025, where she built ranking services for Bing.",
    network: "world",
    entities: ["Alice", "Microsoft", "Bing"],
    day: 36,
    tags: ["user:alice"],
  },
  {
    text: "I recommended Alice for the ML platform rotation after reviewing her retrieval work at Microsoft.",
    network: "experience",
    entities: ["Alice", "ML platform"],
    day: 34,
    tags: ["user:alice"],
  },
  {
    text: "Alice prefers Python over JavaScript because of the data science ecosystem, especially pandas, though she admits JS is better for frontend work.",
    network: "world",
    entities: ["Alice", "Python", "JavaScript", "Pandas"],
    day: 30,
    tags: ["user:alice", "team:eng"],
  },
  {
    text: "Alice dislikes verbose code and recommends type hints on all public functions to keep it readable.",
    network: "world",
    entities: ["Alice", "Python"],
    day: 28,
    tags: ["user:alice"],
  },
  {
    text: "Bob suggested naming the summer party playlist Beach Beats because it felt playful, and the team chose it over Sunset Sessions.",
    network: "world",
    entities: ["Bob", "Beach Beats", "Sunset Sessions"],
    day: 25,
    tags: ["team:social"],
  },
  {
    text: "I helped Bob debug the Redis caching layer; we found the eviction policy was misconfigured and fixed it by switching to allkeys-lru.",
    network: "experience",
    entities: ["Bob", "Redis"],
    day: 22,
    tags: ["team:eng"],
  },
  {
    text: "Redis is open source under the BSD license and has great community support, which makes it excellent for caching.",
    network: "world",
    entities: ["Redis", "BSD"],
    day: 20,
    tags: ["team:eng"],
  },
  {
    text: "Redis changed its license to SSPL in 2024, which raised concerns for cloud deployments.",
    network: "world",
    entities: ["Redis", "SSPL"],
    day: 12,
    tags: ["team:eng"],
  },
  {
    text: "Valkey forked Redis under the BSD license, so new projects requiring a true OSS cache should consider Valkey.",
    network: "world",
    entities: ["Valkey", "Redis", "BSD"],
    day: 8,
    tags: ["team:eng"],
  },
  {
    text: "The team started learning Rust last spring for the payments rewrite because the memory safety guarantees prevent whole classes of production bugs.",
    network: "world",
    entities: ["Rust", "payments rewrite"],
    day: 18,
    tags: ["team:eng"],
  },
  {
    text: "I ran the onboarding workshop for the Rust payments rewrite and collected feedback that compile times frustrated the team.",
    network: "experience",
    entities: ["Rust", "payments rewrite"],
    day: 6,
    tags: ["team:eng"],
  },
  {
    text: "Alice said she loves React and its component model, and used it for the internal dashboard.",
    network: "world",
    entities: ["Alice", "React"],
    day: 15,
    tags: ["user:alice"],
  },
  {
    text: "Alice says she has switched to Vue and won't use React anymore because the dashboard became hard to maintain.",
    network: "world",
    entities: ["Alice", "Vue", "React"],
    day: 3,
    tags: ["user:alice"],
  },
  {
    text: "I believe Python is the best general-purpose language for data science because of libraries like pandas and scikit-learn.",
    network: "opinion",
    entities: ["Python", "Pandas"],
    day: 26,
    confidence: 0.7,
    tags: ["team:eng"],
  },
  {
    text: "Remote work enables creative flexibility, but it needs structure and shared routines to keep delivery consistent.",
    network: "world",
    entities: ["remote work"],
    day: 10,
    tags: ["team:hr"],
  },
];

export function buildSeedFacts(bankId = "bank-demo"): MemoryFact[] {
  return storyline.map((s, i) => {
    const speakerAgent = s.network === "experience";
    return {
      id: `fact-seed-${i}`,
      bankId,
      text: s.text,
      network: s.network,
      entities: s.entities,
      occurredStart: daysAgo(s.day, 12),
      occurredEnd: daysAgo(s.day, 8),
      mentionedAt: daysAgo(s.day),
      confidence: s.confidence,
      tokens: countTokens(s.text),
      tags: s.tags ?? [],
      accessCount: Math.floor((storyline.length - i) * 1.7),
      causal:
        i === 8
          ? [{ targetFactIndex: 7, relationType: "caused_by" as const, strength: 0.85 }]
          : i === 9
            ? [{ targetFactIndex: 8, relationType: "causes" as const, strength: 0.9 }]
            : i === 10
              ? [{ targetFactIndex: 0, relationType: "enables" as const, strength: 0.6 }]
              : [],
      chunkRef: s.text,
      scopes: {
        userId: speakerAgent ? null : (s.tags ?? []).find((t) => t.startsWith("user:"))?.slice(5) ?? null,
        agentId: speakerAgent ? "atlas" : null,
        appId: "sandbox-demo",
        runId: s.day > 20 ? "session-feb" : "session-mar",
      },
      categories: assignCategories(s.text, DEFAULT_CATEGORIES),
      metadata: { source: "seed" },
      history: [],
    };
  });
}

export function buildSeedLinks(facts: MemoryFact[]): GraphLink[] {
  const links = buildLinks(facts, { semanticThreshold: 0.4, sigmaDays: 21 });
  // pin the causal storyline links with stable ids
  return links.map((l, i) => ({ ...l, id: `lnk-seed-${i}` }));
}

export const seedObservations: Observation[] = [
  {
    id: "obs-seed-1",
    bankId: "bank-demo",
    title: "Alice is a Python-focused engineer who values readability",
    content:
      "Alice is a Python-focused software engineer who values readability and simplicity: she prefers Python over JavaScript for data work, dislikes verbose code, and recommends type hints on public functions.",
    evidence: [
      { memoryId: "fact-seed-3", quote: "Alice prefers Python over JavaScript because of the data science ecosystem", timestamp: daysAgo(30) },
      { memoryId: "fact-seed-4", quote: "Alice dislikes verbose code and recommends type hints", timestamp: daysAgo(28) },
    ],
    proofCount: 3,
    trend: "stable",
    scope: ["user:alice"],
    createdAt: daysAgo(27),
    updatedAt: daysAgo(9),
    history: [{ content: "Alice prefers Python and readable code.", at: daysAgo(27) }],
  },
  {
    id: "obs-seed-2",
    bankId: "bank-demo",
    title: "Redis license changed — consider Valkey for true OSS caching",
    content:
      "Redis is technically strong for caching but moved to SSPL, which raised cloud licensing concerns; Valkey forked Redis under BSD, so new projects requiring a true OSS cache should consider Valkey.",
    evidence: [
      { memoryId: "fact-seed-7", quote: "Redis is open source under the BSD license and has great community support", timestamp: daysAgo(20) },
      { memoryId: "fact-seed-8", quote: "Redis changed its license to SSPL in 2024", timestamp: daysAgo(12) },
      { memoryId: "fact-seed-9", quote: "Valkey forked Redis under the BSD license", timestamp: daysAgo(8) },
    ],
    proofCount: 3,
    trend: "strengthening",
    scope: ["team:eng"],
    createdAt: daysAgo(19),
    updatedAt: daysAgo(7),
    history: [
      { content: "Redis is excellent for caching — fast, reliable, and OSS-friendly.", at: daysAgo(19) },
      { content: "Redis is technically strong, but has license concerns for cloud deployments.", at: daysAgo(11) },
    ],
  },
  {
    id: "obs-seed-3",
    bankId: "bank-demo",
    title: "User was a React enthusiast who has now switched to Vue",
    content:
      "Alice was previously a React enthusiast who appreciated its component model, but has now switched to Vue and no longer uses React after the internal dashboard became hard to maintain.",
    evidence: [
      { memoryId: "fact-seed-12", quote: "Alice said she loves React and its component model", timestamp: daysAgo(15) },
      { memoryId: "fact-seed-13", quote: "Alice says she has switched to Vue and won't use React anymore", timestamp: daysAgo(3) },
    ],
    proofCount: 2,
    trend: "new",
    scope: ["user:alice"],
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    history: [{ content: "Alice prefers React for frontend development.", at: daysAgo(14) }],
  },
];

export const seedOpinions: Opinion[] = [
  {
    id: "op-seed-1",
    bankId: "bank-demo",
    text: "I believe Python is the best general-purpose language for data science because of libraries like pandas.",
    confidence: 0.7,
    formedAt: daysAgo(26),
    entities: ["Python", "Pandas"],
    reasoning: "Formed during a reflect on language choice; two world facts about the Python ecosystem supported it.",
    history: [
      { at: daysAgo(26), confidence: 0.7, event: "formed" },
      { at: daysAgo(14), confidence: 0.85, event: "reinforced", note: "New fact about Python adoption in AI/ML retained." },
      { at: daysAgo(4), confidence: 0.55, event: "weakened", note: "Facts about Rust/Julia growth in niche domains retained." },
    ],
  },
  {
    id: "op-seed-2",
    bankId: "bank-demo",
    text: "I think Valkey is the safer default than Redis for new OSS-constrained projects.",
    confidence: 0.62,
    formedAt: daysAgo(7),
    entities: ["Valkey", "Redis"],
    reasoning: "License change to SSPL plus BSD-licensed fork; moderate confidence pending team migration evidence.",
    history: [
      { at: daysAgo(7), confidence: 0.62, event: "formed" },
    ],
  },
];

/** simulated ops history for dashboards (retain/recall/reflect per hour, last 48h) */
export function seedOpsSeries(): { t: number; retain: number; recall: number; reflect: number }[] {
  const out: { t: number; retain: number; recall: number; reflect: number }[] = [];
  for (let i = 47; i >= 0; i--) {
    const t = now - i * 3600000;
    const hour = new Date(t).getHours();
    const work = hour >= 9 && hour <= 18 ? 1 : 0.25;
    const wave = 0.75 + 0.25 * Math.sin(i / 3.4);
    out.push({
      t,
      retain: Math.round(6 * work * wave + (i % 7)),
      recall: Math.round(38 * work * wave + (i % 11)),
      reflect: Math.round(14 * work * wave + (i % 5)),
    });
  }
  return out;
}

export const SAMPLE_RETAIN_TEXTS: { label: string; text: string }[] = [
  {
    label: "Team standup",
    text: "User: We shipped the vector search upgrade yesterday. Latency dropped from 240ms to 90ms on the recall path.\nAssistant: Great — I'll note the improvement and watch the error budget this week.",
  },
  {
    label: "Preference shift",
    text: "User: Honestly I've stopped using Webpack. Vite is much faster for our frontend builds and the DX is better. I don't want new projects scaffolded with Webpack anymore.",
  },
  {
    label: "Hiring decision",
    text: "User: We decided to hire Dana for the infra role because she designed a multi-region Postgres failover at her last job. Start date is 2026-11-02. Bob will mentor her for the first month.",
  },
  {
    label: "Incident retro",
    text: "User: The outage on Friday was caused by an expired TLS certificate on the embeddings endpoint, which prevented the recall service from authenticating. We renewed it and added expiry alerts so it won't happen again.",
  },
];
