/* ============================================================
   External observability export — turns sandbox events, app
   metrics and eval runs into OpenTelemetry-shaped spans plus
   CSV/JSONL serializers, so an external observer (Respan-style
   dashboards, AgentOps, your own collector) can ingest them.
   Pure functions over store data; no network calls.
   ============================================================ */

import type { AppMetrics, EvalRun, SandboxEvent } from "@/lib/types";

export interface OtelSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: "INTERNAL" | "CLIENT";
  start_time_unix_nano: string;
  end_time_unix_nano: string;
  attributes: Record<string, string | number | boolean>;
  status: { code: "OK" | "ERROR" };
}

const APP_TRACE: Record<string, string> = {};

function traceId(app: string): string {
  // stable per-app trace id so spans group naturally in a collector view
  if (!APP_TRACE[app]) {
    let h = 0n;
    for (const ch of app + "|hindsight-sandbox") h = (h * 31n + BigInt(ch.charCodeAt(0))) % 0xfffffffffffffffn;
    APP_TRACE[app] = h.toString(16).padStart(16, "0");
  }
  return APP_TRACE[app];
}

function spanId(id: string): string {
  let h = 0n;
  for (const ch of id) h = (h * 131n + BigInt(ch.charCodeAt(0))) % 0xffffffffffffn;
  return h.toString(16).padStart(12, "0");
}

export function eventsToSpans(events: SandboxEvent[]): OtelSpan[] {
  return events.map((e) => {
    const start = new Date(e.at).getTime();
    const durMs = e.latencyMs ?? 5;
    return {
      trace_id: traceId(e.app),
      span_id: spanId(e.id),
      parent_span_id: null,
      name: `${e.app}.${e.op}`,
      kind: e.op === "recall" || e.op === "reflect" ? "CLIENT" : "INTERNAL",
      start_time_unix_nano: String(BigInt(start) * 1000000n),
      end_time_unix_nano: String(BigInt(start + durMs) * 1000000n),
      attributes: {
        "sandbox.app": e.app,
        "sandbox.op": e.op,
        "sandbox.message": e.message.slice(0, 200),
        ...(e.latencyMs !== undefined ? { "sandbox.latency_ms": e.latencyMs } : {}),
        ...(e.tokens !== undefined ? { "gen_ai.usage.tokens": e.tokens } : {}),
      },
      status: { code: "OK" as const },
    };
  });
}

export interface MetricsSnapshot {
  exported_at: string;
  apps: {
    name: string;
    ops_total: number;
    latency_p50_ms: number;
    latency_p95_ms: number;
    error_rate: number;
    throughput_ops_s: number;
    status: string;
  }[];
}

export function metricsSnapshot(metrics: AppMetrics[]): MetricsSnapshot {
  return {
    exported_at: new Date().toISOString(),
    apps: metrics.map((m) => ({
      name: m.label,
      ops_total: m.ops,
      latency_p50_ms: m.p50,
      latency_p95_ms: m.p95,
      error_rate: m.errorRate,
      throughput_ops_s: m.throughput,
      status: m.status,
    })),
  };
}

/* ---------------- serializers ---------------- */

export function toJsonl(spans: OtelSpan[]): string {
  return spans.map((s) => JSON.stringify(s)).join("\n");
}

export function spansToCsv(spans: OtelSpan[]): string {
  const head = "trace_id,span_id,name,app,op,start_iso,duration_ms,tokens,status";
  const rows = spans.map((s) => {
    const start = new Date(Number(BigInt(s.start_time_unix_nano) / 1000000n)).toISOString();
    const dur = Number((BigInt(s.end_time_unix_nano) - BigInt(s.start_time_unix_nano)) / 1000000n);
    const tokens = s.attributes["gen_ai.usage.tokens"] ?? "";
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    return [s.trace_id, s.span_id, esc(s.name), esc(s.attributes["sandbox.app"]), esc(s.attributes["sandbox.op"]), start, dur, tokens, s.status.code].join(",");
  });
  return [head, ...rows].join("\n");
}

export function evalRunsToJson(runs: EvalRun[]): string {
  return JSON.stringify(
    runs.map((r) => ({
      run_id: r.id,
      name: r.name,
      at: r.at,
      bank_id: r.bankId,
      settings: r.settingsSnapshot,
      accuracy_all: r.accuracy,
      accuracy_by_cutoff: r.accuracyByCutoff,
      mean_tokens_per_query: r.meanTokens,
      p50_latency_ms: r.p50LatencyMs,
      questions: r.results.length,
    })),
    null,
    2
  );
}

export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** observer connection snippet (Respan/AgentOps-style config) */
export function observerConfigSnippet(origin: string): string {
  return `# Send sandbox telemetry to any OTLP-compatible collector
export HINDSIGHT_SANDBOX_OTEL_ENDPOINT="${origin}/api/otel"
export HINDSIGHT_SANDBOX_OTEL_PROTOCOL="http/json"

# Python bridge (conceptual): replay the exported JSONL into your SDK of choice
# import json, requests
# for line in open("sandbox-spans.jsonl"):
#     span = json.loads(line)
#     requests.post(os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] + "/v1/traces",
#                   json={"resourceSpans": [{"scopeSpans": [{"spans": [span]}]}]})`;
}
