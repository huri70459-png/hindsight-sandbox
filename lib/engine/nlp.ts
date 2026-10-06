/* ============================================================
   Lightweight deterministic NLP used by the in-browser memory
   engine: hashed bag-of-words embeddings, BM25-style lexical
   scoring, temporal expression parsing, entity extraction.
   ============================================================ */

import { hash32 } from "@/lib/utils";

export const EMBED_DIM = 128;

const STOPWORDS = new Set(
  "the a an and or but if then than that this these those of to in on for with without from at by is are was were be been being i you he she it we they me him her us them my your his its our their do does did done have has had having will would can could should may might must not no yes so as about into over after before during between".split(
    " "
  )
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** deterministic hashed embedding (stand-in for a real encoder) */
export function embed(text: string): Float32Array {
  const v = new Float32Array(EMBED_DIM);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h = hash32(tok);
    const idx = h % EMBED_DIM;
    const sign = (h >>> 16) & 1 ? 1 : -1;
    v[idx] += sign;
    // bigram-ish smoothing
    const idx2 = (h >>> 8) % EMBED_DIM;
    v[idx2] += sign * 0.35;
  }
  // normalize
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] /= norm;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // inputs are normalized
}

/* ---------------- BM25 ---------------- */

export interface Bm25Corpus {
  docs: string[][]; // tokenized docs
  avgdl: number;
  df: Map<string, number>;
  N: number;
}

export function buildBm25(docs: string[]): Bm25Corpus {
  const tokenized = docs.map(tokenize);
  const df = new Map<string, number>();
  let total = 0;
  for (const d of tokenized) {
    total += d.length;
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { docs: tokenized, avgdl: total / Math.max(1, tokenized.length), df, N: tokenized.length };
}

export function bm25Score(corpus: Bm25Corpus, docIdx: number, query: string, k1 = 1.4, b = 0.75): number {
  const doc = corpus.docs[docIdx];
  if (!doc || doc.length === 0) return 0;
  const tf = new Map<string, number>();
  for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
  const q = tokenize(query);
  let score = 0;
  for (const term of new Set(q)) {
    const f = tf.get(term) ?? 0;
    if (f === 0) continue;
    const dfTerm = corpus.df.get(term) ?? 1;
    const idf = Math.log(1 + (corpus.N - dfTerm + 0.5) / (dfTerm + 0.5));
    score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + b * (doc.length / corpus.avgdl)));
  }
  return score;
}

/* ---------------- temporal parsing ---------------- */

export interface ParsedWindow {
  start: Date;
  end: Date;
  label: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** rule-based temporal analyzer (mirrors the hybrid parser's fast path) */
export function parseTemporal(query: string, now = new Date()): ParsedWindow | null {
  const q = query.toLowerCase();

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (/\b(today)\b/.test(q)) {
    return { start: startOf(now), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59), label: "today" };
  }
  if (/\b(yesterday)\b/.test(q)) {
    const s = new Date(now); s.setDate(s.getDate() - 1);
    return { start: startOf(s), end: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59), label: "yesterday" };
  }
  if (/\b(last|past)\s+week\b/.test(q)) {
    const e = new Date(now); e.setDate(e.getDate() - 1);
    const s = new Date(e); s.setDate(s.getDate() - 7);
    return { start: startOf(s), end: e, label: "last week" };
  }
  if (/\b(last|past)\s+(30\s*days|month)\b/.test(q)) {
    const e = new Date(now);
    const s = new Date(e); s.setDate(s.getDate() - 30);
    return { start: startOf(s), end: e, label: "last month" };
  }
  const season = q.match(/\b(last|this)\s+(spring|summer|fall|autumn|winter)\b/);
  if (season) {
    const y = now.getFullYear() - (season[1] === "last" ? 1 : 0);
    const ranges: Record<string, [number, number]> = {
      spring: [2, 20], summer: [5, 21], fall: [8, 22], autumn: [8, 22], winter: [11, 21],
    };
    const [sm, sd] = ranges[season[2]];
    const em = sm === 11 ? new Date(y + 1, 1, 28) : new Date(y, sm + 3, sd);
    return { start: new Date(y, sm, sd), end: em, label: `${season[1]} ${season[2]}` };
  }
  const monthYear = q.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/);
  if (monthYear) {
    const m = MONTHS.indexOf(monthYear[1]);
    const y = monthYear[2] ? parseInt(monthYear[2]) : now.getFullYear();
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59), label: `${monthYear[1]} ${y}` };
  }
  const yearOnly = q.match(/\bin\s+(20\d{2})\b/);
  if (yearOnly) {
    const y = parseInt(yearOnly[1]);
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59), label: String(y) };
  }
  const q1 = q.match(/\bq([1-4])(?:\s+(20\d{2}))?\b/);
  if (q1) {
    const y = q1[2] ? parseInt(q1[2]) : now.getFullYear();
    const qi = parseInt(q1[1]) - 1;
    return { start: new Date(y, qi * 3, 1), end: new Date(y, qi * 3 + 3, 0, 23, 59), label: `Q${q1[1]} ${y}` };
  }
  if (/\b(last|past)\s+(\d+)\s*(days?|weeks?|months?)\b/.test(q)) {
    const m = q.match(/\b(last|past)\s+(\d+)\s*(days?|weeks?|months?)\b/)!;
    const n = parseInt(m[2]);
    const e = new Date(now);
    const s = new Date(now);
    if (m[3].startsWith("day")) s.setDate(s.getDate() - n);
    else if (m[3].startsWith("week")) s.setDate(s.getDate() - n * 7);
    else s.setMonth(s.getMonth() - n);
    return { start: startOf(s), end: e, label: `last ${n} ${m[3]}` };
  }
  return null;
}

/** detect explicit dates inside content, e.g. "March 2026", "2024-05-01" */
export function extractDateMentions(text: string, fallbackYear: number): { start: Date; end: Date } | null {
  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    return { start: d, end: d };
  }
  const monthYear = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i
  );
  if (monthYear) {
    const m = MONTHS.indexOf(monthYear[1].toLowerCase());
    const y = parseInt(monthYear[2]);
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
  }
  const year = text.match(/\b(20[12]\d)\b/);
  if (year) {
    const y = parseInt(year[1]);
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  }
  void fallbackYear;
  return null;
}

/* ---------------- entity extraction ---------------- */

const ENTITY_BLACKLIST = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "I", "The", "This", "That",
  "They", "She", "He", "We", "You", "It", "But", "And", "So", "Because",
]);

export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  // Capitalized runs (names, orgs, products)
  const caps = text.match(/\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\b/g) ?? [];
  for (const c of caps) {
    const first = c.split(" ")[0];
    if (ENTITY_BLACKLIST.has(first)) {
      const rest = c.split(" ").slice(1).join(" ");
      if (rest) found.add(rest);
      continue;
    }
    found.add(c);
  }
  // quoted products / titles
  const quoted = text.match(/"([^"]{2,40})"/g) ?? [];
  for (const qstr of quoted) found.add(qstr.replace(/"/g, ""));
  // tech terms
  const tech = text.match(
    /\b(python|javascript|typescript|react|vue|rust|golang|postgres|postgresql|redis|valkey|docker|kubernetes|tensorflow|pytorch|pandas|nextjs|tailwind)\b/gi
  ) ?? [];
  for (const t of tech) found.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  return [...found].slice(0, 8);
}

/** canonicalize entity mentions (Levenshtein-lite prefix merge) */
export function resolveEntities(mentions: string[], known: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const k of known) {
    if (norm(k) === norm(mentions[0] ?? "")) return k;
  }
  return mentions[0] ?? "";
}

/* ---------------- causal cue detection ---------------- */

export const CAUSAL_CUES: { pattern: RegExp; type: "causes" | "enables" | "prevents" }[] = [
  { pattern: /\bbecause\b|\bsince\b|\bdue to\b/i, type: "causes" },
  { pattern: /\bso that\b|\benables?\b|\ballows?\b|\blet(s)?\b/i, type: "enables" },
  { pattern: /\bprevents?\b|\bblocks?\b|\bavoids?\b/i, type: "prevents" },
  { pattern: /\btherefore\b|\bled to\b|\bresulted in\b/i, type: "causes" },
];

export function detectCausal(text: string): "causes" | "enables" | "prevents" | null {
  for (const cue of CAUSAL_CUES) if (cue.pattern.test(text)) return cue.type;
  return null;
}

/** simulated cross-encoder: query-doc interaction proxy (token overlap + bigram bonus + entity bonus) */
export function crossEncoderScore(query: string, doc: string): number {
  const q = new Set(tokenize(query));
  const d = tokenize(doc);
  const dset = new Set(d);
  let overlap = 0;
  for (const t of q) if (dset.has(t)) overlap += 1;
  const coverage = overlap / Math.max(1, q.size);
  // bigram adjacency bonus
  const qArr = [...q];
  let bigram = 0;
  for (let i = 0; i < d.length - 1; i++) {
    if (qArr.includes(d[i]) && qArr.includes(d[i + 1])) bigram += 1;
  }
  const raw = coverage * 0.82 + Math.min(0.18, bigram * 0.045);
  // sigmoid-normalized like the docs describe
  return 1 / (1 + Math.exp(-(raw * 8 - 3.2)));
}
