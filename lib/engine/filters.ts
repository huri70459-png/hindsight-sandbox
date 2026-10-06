/* ============================================================
   Memory Filters v2 — a Mem0-style nested filter DSL evaluated
   client-side over MemoryFacts. Supports AND/OR/NOT grouping,
   bare values (implicit eq), operator objects, wildcards ("*"),
   flat sibling keys (implicitly ANDed) and strict field
   validation mirroring the platform's allow-list errors.
   ============================================================ */

import type { MemoryFact, FilterNode } from "@/lib/types";

export const FILTER_FIELDS = [
  "user_id", "agent_id", "app_id", "run_id",
  "created_at", "updated_at", "timestamp", "expiration_date",
  "text", "categories", "metadata", "keywords", "memory_ids",
  "network", "tags", "confidence",
] as const;

export const LOGICAL_OPS = ["AND", "OR", "NOT"] as const;

const TIME_FIELDS = new Set(["created_at", "updated_at", "timestamp", "expiration_date"]);
const VALUE_OPS = new Set(["eq", "ne", "in", "gt", "gte", "lt", "lte", "contains", "icontains"]);

export interface FilterValidation {
  ok: boolean;
  errors: string[];
}

/** validate a filters object; returns platform-style error messages */
export function validateFilters(filters: unknown): FilterValidation {
  const errors: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      errors.push(`${path}: expected a filter object`);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if ((LOGICAL_OPS as readonly string[]).includes(key)) {
        const children = obj[key];
        if (key === "NOT") {
          if (Array.isArray(children)) children.forEach((c, i) => walk(c, `${path}.NOT[${i}]`));
          else walk(children, `${path}.NOT`);
        } else {
          if (!Array.isArray(children)) {
            errors.push(`${path}.${key}: expected an array of conditions`);
            continue;
          }
          children.forEach((c, i) => walk(c, `${path}.${key}[${i}]`));
        }
        continue;
      }
      if (!(FILTER_FIELDS as readonly string[]).includes(key)) {
        errors.push(
          `Top-level key must be a logical operator or an allowed field: ['${[...LOGICAL_OPS, ...FILTER_FIELDS].join(
            "', '"
          )}'] — got '${key}'`
        );
        continue;
      }
      const val = obj[key];
      if (TIME_FIELDS.has(key) && val && typeof val === "object" && !Array.isArray(val)) {
        const ops = Object.keys(val as object);
        if (ops.includes("eq")) errors.push(`${path}.${key}: explicit 'eq' is rejected on time fields — pass a bare value`);
        for (const op of ops)
          if (!["ne", "in", "gt", "gte", "lt", "lte"].includes(op))
            errors.push(`${path}.${key}: unsupported operator '${op}'`);
      } else if (key === "categories" && val && typeof val === "object" && !Array.isArray(val)) {
        for (const op of Object.keys(val as object))
          if (!["in", "contains"].includes(op))
            errors.push(`${path}.categories: only 'in' and 'contains' are supported ('${op}' rejected)`);
      } else if (val && typeof val === "object" && !Array.isArray(val) && key !== "metadata") {
        for (const op of Object.keys(val as object))
          if (!VALUE_OPS.has(op)) errors.push(`${path}.${key}: unknown operator '${op}'`);
      }
    }
  };
  walk(filters, "filters");
  return { ok: errors.length === 0, errors };
}

/* ---------- field extraction ---------- */

function fieldValue(fact: MemoryFact, field: string): unknown {
  switch (field) {
    case "user_id": return fact.scopes?.userId ?? null;
    case "agent_id": return fact.scopes?.agentId ?? null;
    case "app_id": return fact.scopes?.appId ?? null;
    case "run_id": return fact.scopes?.runId ?? null;
    case "created_at": return fact.occurredStart ?? fact.mentionedAt;
    case "updated_at": return fact.history?.length ? fact.history[fact.history.length - 1].at : fact.mentionedAt;
    case "timestamp": return fact.mentionedAt;
    case "expiration_date": return fact.metadata?.["expiration_date"] ?? null;
    case "text": return fact.text;
    case "categories": return fact.categories ?? [];
    case "metadata": return fact.metadata ?? {};
    case "keywords": return fact.text; // substring target
    case "memory_ids": return fact.id;
    case "network": return fact.network;
    case "tags": return fact.tags ?? [];
    case "confidence": return fact.confidence ?? null;
    default: return null;
  }
}

function compare(a: unknown, op: string, b: unknown): boolean {
  const asNum = (v: unknown) => {
    if (typeof v === "number") return v;
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? Number(v) : t;
  };
  switch (op) {
    case "eq": return String(a) === String(b);
    case "ne": return String(a) !== String(b);
    case "in": return Array.isArray(b) && b.some((x) => String(x) === String(a));
    case "gt": return asNum(a) > asNum(b);
    case "gte": return asNum(a) >= asNum(b);
    case "lt": return asNum(a) < asNum(b);
    case "lte": return asNum(a) <= asNum(b);
    case "contains": return String(a).includes(String(b));
    case "icontains": return String(a).toLowerCase().includes(String(b).toLowerCase());
    default: return false;
  }
}

function matchCondition(fact: MemoryFact, field: string, val: unknown): boolean {
  const actual = fieldValue(fact, field);

  // wildcard: matches any non-null value
  if (val === "*") return actual !== null && actual !== undefined && actual !== "";

  // bare value → implicit eq (arrays on list-fields → 'in' semantics)
  if (val === null || typeof val !== "object") {
    if (Array.isArray(actual)) return actual.some((x) => String(x) === String(val));
    return compare(actual, "eq", val);
  }

  // array value on a scalar field → implicit in
  if (Array.isArray(val)) {
    if (field === "memory_ids") return val.some((x) => String(x) === String(actual));
    return val.some((x) => compare(actual, "eq", x));
  }

  const ops = val as Record<string, unknown>;

  // metadata special case: {key: value} equality map
  if (field === "metadata") {
    const md = (actual ?? {}) as Record<string, string>;
    if ("contains" in ops) return JSON.stringify(md).includes(String(ops.contains));
    return Object.entries(ops).every(([k, v]) => String(md[k] ?? "") === String(v));
  }

  return Object.entries(ops).every(([op, operand]) => {
    if (op === "in" || op === "contains" || op === "icontains") {
      if (Array.isArray(actual)) {
        if (op === "in") return (operand as unknown[]).some((x) => actual.some((a) => String(a) === String(x)));
        return actual.some((a) => compare(a, op, operand));
      }
      return compare(actual, op, operand);
    }
    return compare(actual, op, operand);
  });
}

/** evaluate a filters object against one fact */
export function matchesFilters(fact: MemoryFact, filters: FilterNode | null | undefined): boolean {
  if (!filters || Object.keys(filters).length === 0) return true;

  const entries = Object.entries(filters);
  // flat sibling keys are implicitly ANDed
  return entries.every(([key, val]) => {
    if (key === "AND") return (val as FilterNode[]).every((c) => matchesFilters(fact, c));
    if (key === "OR") return (val as FilterNode[]).some((c) => matchesFilters(fact, c));
    if (key === "NOT") {
      const inner = Array.isArray(val) ? { AND: val as FilterNode[] } : (val as FilterNode);
      return !matchesFilters(fact, inner);
    }
    return matchCondition(fact, key, val);
  });
}

export function applyFilters(facts: MemoryFact[], filters: FilterNode | null | undefined): MemoryFact[] {
  const v = filters ? validateFilters(filters) : { ok: true, errors: [] };
  if (!v.ok) return facts; // invalid filters are ignored (UI surfaces the error)
  return facts.filter((f) => matchesFilters(f, filters));
}
