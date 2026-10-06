"use client";

/* FilterBuilder — visual ⇄ JSON editor for the Mem0-style v2
   filter DSL, with live validation against the field allow-list. */

import { useMemo, useState } from "react";
import { Braces, Filter, ListFilter, Plus, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FILTER_FIELDS, validateFilters } from "@/lib/engine/filters";
import type { FilterNode } from "@/lib/types";

const OPERATORS = ["=", "≠", "in", "gt", "gte", "lt", "lte", "contains", "icontains", "*"] as const;
type Op = (typeof OPERATORS)[number];

const OP_TO_DSL: Record<Op, string> = {
  "=": "eq",
  "≠": "ne",
  in: "in",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  contains: "contains",
  icontains: "icontains",
  "*": "wildcard",
};

interface VisualRow {
  id: number;
  field: string;
  op: Op;
  value: string;
}

let rowId = 0;

function rowsToFilter(rows: VisualRow[], combinator: "AND" | "OR"): FilterNode | null {
  const conditions = rows
    .filter((r) => r.field && (r.value.trim() !== "" || r.op === "*"))
    .map((r) => {
      if (r.op === "*") return { [r.field]: "*" };
      if (r.op === "=") return { [r.field]: r.value.trim() };
      if (r.op === "in") return { [r.field]: { in: r.value.split(",").map((v) => v.trim()).filter(Boolean) } };
      return { [r.field]: { [OP_TO_DSL[r.op]]: r.value.trim() } };
    });
  if (!conditions.length) return null;
  if (conditions.length === 1) return conditions[0] as FilterNode;
  return { [combinator]: conditions } as FilterNode;
}

export function FilterBuilder({
  filters,
  onChange,
  className,
}: {
  filters: FilterNode | null;
  onChange: (f: FilterNode | null) => void;
  className?: string;
}) {
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [rows, setRows] = useState<VisualRow[]>(() => filterToRows(filters));
  const [jsonText, setJsonText] = useState(() => (filters ? JSON.stringify(filters, null, 2) : ""));

  const jsonValidation = useMemo(() => {
    if (!jsonText.trim()) return { ok: true, errors: [] as string[] };
    try {
      const parsed = JSON.parse(jsonText);
      return validateFilters(parsed);
    } catch (e) {
      return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
    }
  }, [jsonText]);

  const commitVisual = (nextRows: VisualRow[], nextComb: "AND" | "OR") => {
    setRows(nextRows);
    const f = rowsToFilter(nextRows, nextComb);
    setJsonText(f ? JSON.stringify(f, null, 2) : "");
    onChange(f);
  };

  const commitJson = (text: string) => {
    setJsonText(text);
    if (!text.trim()) {
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const v = validateFilters(parsed);
      if (v.ok) {
        onChange(parsed);
        setRows(filterToRows(parsed));
      } else {
        onChange(parsed); // recall ignores invalid filters; builder surfaces errors
      }
    } catch {
      /* keep typing */
    }
  };

  return (
    <div className={cn("rounded-xl border border-border-soft bg-surface-2 p-3", className)}>
      <div className="flex items-center gap-2 mb-2.5">
        <Filter size={13} className="text-accent" />
        <span className="text-[11px] font-semibold text-ink uppercase tracking-wider">Filters v2</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setMode("visual")}
            className={cn("chip cursor-pointer transition-all flex items-center gap-1", mode === "visual" && "border-accent-border text-accent bg-accent-soft")}
          >
            <ListFilter size={10} /> visual
          </button>
          <button
            onClick={() => setMode("json")}
            className={cn("chip cursor-pointer transition-all flex items-center gap-1", mode === "json" && "border-accent-border text-accent bg-accent-soft")}
          >
            <Braces size={10} /> JSON
          </button>
          {(filters || jsonText) && (
            <button
              className="chip cursor-pointer text-faint hover:text-danger"
              onClick={() => {
                setRows([]);
                setJsonText("");
                onChange(null);
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      {mode === "visual" ? (
        <div className="space-y-1.5">
          {rows.length > 1 && (
            <div className="flex items-center gap-2 text-[10px] text-faint">
              combine with
              <button
                className={cn("chip cursor-pointer", combinator === "AND" && "border-accent-border text-accent")}
                onClick={() => commitVisual(rows, "AND")}
              >
                AND
              </button>
              <button
                className={cn("chip cursor-pointer", combinator === "OR" && "border-accent-border text-accent")}
                onClick={() => commitVisual(rows, "OR")}
              >
                OR
              </button>
              <span className="ml-auto italic">nested groups → JSON mode</span>
            </div>
          )}
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-1.5">
              <Select
                value={r.field}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, field: e.target.value };
                  commitVisual(next, combinator);
                }}
                className="h-7 text-[11px] w-32 font-mono"
              >
                {FILTER_FIELDS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
              <Select
                value={r.op}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, op: e.target.value as Op };
                  commitVisual(next, combinator);
                }}
                className="h-7 text-[11px] w-24 font-mono"
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
              {r.op !== "*" && (
                <Input
                  value={r.value}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, value: e.target.value };
                    commitVisual(next, combinator);
                  }}
                  placeholder={r.op === "in" ? "comma,separated,list" : "value"}
                  className="h-7 text-[11px] font-mono flex-1"
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-faint hover:text-danger shrink-0"
                onClick={() => commitVisual(rows.filter((_, j) => j !== i), combinator)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => commitVisual([...rows, { id: rowId++, field: "user_id", op: "=", value: "" }], combinator)}
          >
            <Plus size={11} /> condition
          </Button>
        </div>
      ) : (
        <div>
          <textarea
            value={jsonText}
            onChange={(e) => commitJson(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={'{\n  "AND": [\n    { "user_id": "alice" },\n    { "categories": { "in": ["preferences"] } }\n  ]\n}'}
            className={cn(
              "w-full rounded-lg border bg-bg-soft px-3 py-2 text-[11.5px] font-mono text-ink outline-none resize-y transition-colors",
              jsonValidation.ok ? "border-border focus:border-accent-border" : "border-danger/60"
            )}
          />
          {!jsonValidation.ok && (
            <div className="mt-1.5 space-y-0.5">
              {jsonValidation.errors.slice(0, 3).map((e, i) => (
                <p key={i} className="text-[10.5px] text-danger font-mono">✗ {e}</p>
              ))}
            </div>
          )}
          {jsonValidation.ok && jsonText.trim() && (
            <p className="text-[10.5px] text-ok font-mono mt-1.5">✓ valid filter</p>
          )}
        </div>
      )}
    </div>
  );
}

/** best-effort conversion of a filter object into flat visual rows */
function filterToRows(f: FilterNode | null): VisualRow[] {
  if (!f) return [];
  const rows: VisualRow[] = [];
  const pushCond = (obj: Record<string, unknown>) => {
    for (const [field, val] of Object.entries(obj)) {
      if (["AND", "OR", "NOT"].includes(field)) continue;
      if (val === "*") {
        rows.push({ id: rowId++, field, op: "*", value: "" });
      } else if (val === null || typeof val !== "object") {
        rows.push({ id: rowId++, field, op: "=", value: String(val ?? "") });
      } else if (Array.isArray(val)) {
        rows.push({ id: rowId++, field, op: "in", value: val.join(",") });
      } else {
        const [op, operand] = Object.entries(val as Record<string, unknown>)[0] ?? [];
        if (op) {
          const visualOp = (OPERATORS as readonly string[]).includes(op)
            ? (op === "eq" ? "=" : op === "ne" ? "≠" : (op as Op))
            : "=";
          rows.push({
            id: rowId++,
            field,
            op: visualOp as Op,
            value: Array.isArray(operand) ? operand.join(",") : String(operand ?? ""),
          });
        }
      }
    }
  };
  const arr = f.AND ?? f.OR;
  if (Array.isArray(arr)) arr.forEach((c) => pushCond(c as Record<string, unknown>));
  else pushCond(f as Record<string, unknown>);
  return rows;
}
