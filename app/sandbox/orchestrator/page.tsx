"use client";

/* Orchestrator — mount apps as nodes, wire typed edges, choose
   routing strategies, run the pipeline and watch packets + metrics. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Cable, Database, Gauge, GraduationCap, Play, Plug, Plus,
  SlidersHorizontal, Sparkles, Trash2, Webhook, Workflow, Cpu, Radio,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Segmented, Toggle } from "@/components/ui";
import { Sparkline } from "@/components/ui";
import { useSandbox } from "@/lib/store";
import { cn, fmtMs, fmtNum } from "@/lib/utils";
import type { AppId, OrchestratorEdge, OrchestratorNode } from "@/lib/types";

const APP_CATALOG: {
  appId: AppId;
  label: string;
  icon: React.ElementType;
  color: string;
  href?: string;
  desc: string;
}[] = [
  { appId: "memory", label: "Memory App", icon: Database, color: "var(--world)", href: "/sandbox/memory", desc: "retain / recall / reflect over the four networks" },
  { appId: "prompts", label: "Prompt Studio", icon: Sparkles, color: "var(--experience)", href: "/sandbox/prompts", desc: "versioned templates + disposition shaping" },
  { appId: "context", label: "Context Tuner", icon: SlidersHorizontal, color: "var(--observation)", href: "/sandbox/context", desc: "token budgets, boosts, consolidation knobs" },
  { appId: "learning", label: "Continuous Learner", icon: GraduationCap, color: "var(--opinion)", href: "/sandbox/learning", desc: "CRUD bank + Ledger-QA episodes" },
  { appId: "llm-router", label: "LLM Router", icon: Cpu, color: "var(--accent)", desc: "routes generation to the configured backbone" },
  { appId: "datasource", label: "Data Source", icon: Radio, color: "var(--accent-2)", desc: "interaction stream / document feed" },
  { appId: "evaluator", label: "Evaluator", icon: Gauge, color: "var(--danger)", desc: "LLM-as-judge scoring of answers" },
  { appId: "webhook", label: "Webhook Sink", icon: Webhook, color: "var(--muted)", desc: "event-driven downstream notifications" },
];

const NODE_W = 184;
const NODE_H = 76;

type Mode = "select" | "connect";

export default function OrchestratorPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  const [mode, setMode] = useState<Mode>("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [packetT, setPacketT] = useState(0);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [pan, setPan] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const nodeById = useMemo(() => new Map(s.nodes.map((n) => [n.id, n])), [s.nodes]);

  /* ---- run pipeline: topological pulse animation ---- */
  const runPipeline = useCallback(() => {
    if (running) return;
    setRunning(true);
    setPacketT(0);
    const start = performance.now();
    const dur = 2600;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      setPacketT(t);
      if (t < 1) requestAnimationFrame(tick);
      else {
        setRunning(false);
        s.recordRun(
          Object.fromEntries(s.nodes.filter((n) => n.mounted).map((n) => [n.appId, 2])) as Record<string, number>
        );
        s.logEvent({
          app: "orchestrator",
          op: "orchestrate",
          message: `Pipeline run #${s.pipelineRuns + 1} — ${s.nodes.filter((n) => n.mounted).length} nodes, ${s.edges.filter((e) => e.active).length} active edges`,
          latencyMs: Math.round(dur / 2.6),
        });
      }
    };
    requestAnimationFrame(tick);
  }, [running, s]);

  /* ---- drag & pan ---- */
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.x) / view.k,
      y: (e.clientY - rect.top - view.y) / view.k,
    };
  };

  const onNodePointerDown = (e: React.PointerEvent, n: OrchestratorNode) => {
    if (mode === "connect") return;
    e.stopPropagation();
    const p = toCanvas(e);
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y });
    setSelectedNode(n.id);
    setSelectedEdge(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag) {
      const p = toCanvas(e);
      s.moveNode(drag.id, Math.round(p.x - drag.dx), Math.round(p.y - drag.dy));
    } else if (pan) {
      setView((v) => ({ ...v, x: pan.ox + (e.clientX - pan.x), y: pan.oy + (e.clientY - pan.y) }));
    }
  };

  const onPointerUp = () => {
    setDrag(null);
    setPan(null);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setConnectFrom(null);
    setPan({ x: e.clientX, y: e.clientY, ox: view.x, oy: view.y });
  };

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!svgRef.current) return;
      e.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(1.8, Math.max(0.45, v.k * (e.deltaY > 0 ? 0.94 : 1.06)));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    const el = svgRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, []);

  /* ---- port click in connect mode ---- */
  const onPort = (e: React.PointerEvent, nodeId: string, kind: "out" | "in") => {
    e.stopPropagation();
    if (mode !== "connect") return;
    if (kind === "out") {
      setConnectFrom(nodeId);
    } else if (connectFrom && connectFrom !== nodeId) {
      const dt: OrchestratorEdge["dataType"] =
        nodeById.get(connectFrom)?.appId === "datasource" ? "facts"
        : nodeById.get(connectFrom)?.appId === "prompts" ? "prompts"
        : nodeById.get(connectFrom)?.appId === "context" ? "context"
        : nodeById.get(connectFrom)?.appId === "learning" ? "events"
        : nodeById.get(connectFrom)?.appId === "evaluator" ? "feedback"
        : "context";
      s.connect(connectFrom, nodeId, dt);
      setConnectFrom(null);
    }
  };

  const metricsFor = (appId: string) => s.metrics.find((m) => m.appId === appId);

  if (!hydrated) return <Empty title="Restoring sandbox state…" />;

  return (
    <div className="max-w-[1500px] mx-auto grid xl:grid-cols-[220px_1fr_290px] gap-4">
      {/* ========= palette ========= */}
      <div className="space-y-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-widest text-faint font-semibold px-1 mb-2">Mount an app</p>
          <div className="space-y-1">
            {APP_CATALOG.map((a) => (
              <button
                key={a.appId}
                onClick={() => {
                  const id = s.addNode(a.appId, a.label, 120 + Math.round(Math.random() * 480), 80 + Math.round(Math.random() * 300));
                  setSelectedNode(id);
                }}
                className="w-full flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 hover:border-accent-border/50 hover:bg-accent-soft transition-all text-left group"
                title={a.desc}
              >
                <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 border" style={{ color: a.color, borderColor: `color-mix(in srgb, ${a.color} 35%, transparent)`, background: `color-mix(in srgb, ${a.color} 10%, transparent)` }}>
                  <a.icon size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-ink truncate group-hover:text-accent transition-colors">{a.label}</span>
                  <span className="block text-[9.5px] text-faint truncate">{a.desc}</span>
                </span>
                <Plus size={12} className="text-faint ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-3 space-y-2.5">
          <p className="text-[10px] uppercase tracking-widest text-faint font-semibold px-1">Canvas</p>
          <Segmented
            size="sm"
            className="w-full [&>button]:flex-1"
            value={mode}
            onChange={(v) => { setMode(v); setConnectFrom(null); }}
            options={[
              { value: "select", label: "Select / drag" },
              { value: "connect", label: "Wire mode" },
            ]}
          />
          <Button variant="primary" className="w-full" onClick={runPipeline} disabled={running}>
            {running ? <RefreshSpin /> : <Play size={13} />}
            {running ? "Running…" : "Run pipeline"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
            Reset view · {Math.round(view.k * 100)}%
          </Button>
          {mode === "connect" && (
            <p className="text-[10.5px] text-accent leading-relaxed px-1 anim-fade-up">
              {connectFrom
                ? "Now click an input port (left side) on the target node."
                : "Click an output port (right side) on the source node to start a wire."}
            </p>
          )}
        </Card>
      </div>

      {/* ========= canvas ========= */}
      <Card className="p-0 overflow-hidden relative min-h-[560px]">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <Badge color={running ? "var(--ok)" : undefined}>
            <span className={cn("w-1.5 h-1.5 rounded-full", running ? "bg-ok anim-pulse-soft" : "bg-faint")} />
            {running ? "flowing" : `${s.pipelineRuns} runs`}
          </Badge>
          <span className="chip">{s.nodes.length} nodes · {s.edges.length} edges</span>
        </div>
        <svg
          ref={svgRef}
          className="w-full h-[560px] dot-grid cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* edges */}
            {s.edges.map((e) => {
              const a = nodeById.get(e.source);
              const b = nodeById.get(e.target);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
              const sel = selectedEdge === e.id;
              const color = EDGE_COLORS[e.dataType];
              return (
                <g key={e.id}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth="14" className="cursor-pointer"
                    onPointerDown={(ev) => { ev.stopPropagation(); setSelectedEdge(e.id); setSelectedNode(null); }} />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={sel ? 2.4 : 1.6}
                    strokeOpacity={e.active ? (sel ? 1 : 0.65) : 0.15}
                    strokeDasharray={e.active ? undefined : "4 5"}
                    className={cn("transition-all", e.active && running && "anim-dash")}
                  />
                  {/* flowing packet during run */}
                  {running && e.active && (
                    <circle r="4" fill={color} opacity="0.95">
                      <animateMotion dur="1.1s" begin={`${(edgeOrder(s.edges, e.id) * 0.18).toFixed(2)}s`} repeatCount="2" path={d} />
                    </circle>
                  )}
                  {/* data-type label */}
                  <text x={mx} y={(y1 + y2) / 2 - 7} textAnchor="middle" fontSize="9" fill={sel ? color : "var(--faint)"} fontFamily="var(--font-jetbrains), monospace">
                    {e.dataType} · {e.routing}
                  </text>
                </g>
              );
            })}

            {/* nodes */}
            {s.nodes.map((n) => {
              const cat = APP_CATALOG.find((c) => c.appId === n.appId)!;
              const m = metricsFor(n.appId);
              const sel = selectedNode === n.id;
              const Icon = cat.icon;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-move"
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                  opacity={n.mounted ? 1 : 0.4}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="12"
                    fill="var(--surface)"
                    stroke={sel ? "var(--accent)" : connectFrom === n.id ? "var(--accent-2)" : "var(--border)"}
                    strokeWidth={sel || connectFrom === n.id ? 2 : 1.2}
                    style={sel ? { filter: "drop-shadow(0 0 10px var(--glow))" } : undefined}
                  />
                  <rect x="0" y="0" width="4" height={NODE_H} rx="2" fill={cat.color} opacity={n.mounted ? 1 : 0.3} />
                  <g transform="translate(14,14)">
                    <rect width="26" height="26" rx="7" fill={`color-mix(in srgb, ${cat.color} 14%, transparent)`} stroke={`color-mix(in srgb, ${cat.color} 40%, transparent)`} />
                    <g transform="translate(5,5)" style={{ color: cat.color }}>
                      <IconSvg Icon={Icon} />
                    </g>
                  </g>
                  <text x="48" y="26" fontSize="11.5" fontWeight="600" fill="var(--text)">
                    {n.label.length > 17 ? n.label.slice(0, 16) + "…" : n.label}
                  </text>
                  <text x="48" y="41" fontSize="9" fill="var(--faint)" fontFamily="var(--font-jetbrains), monospace">
                    {n.mounted ? (m ? `${fmtNum(m.ops)} ops · p50 ${m.p50}ms` : "mounted · idle") : "unmounted"}
                  </text>
                  {/* sparkline */}
                  {m && n.mounted && (
                    <g transform={`translate(${NODE_W - 62},46)`}>
                      <polyline
                        points={m.series.slice(-16).map((v, i, arr) => `${(i / 15) * 52},${16 - (v / Math.max(...arr)) * 14}`).join(" ")}
                        fill="none"
                        stroke={cat.color}
                        strokeWidth="1.2"
                        opacity="0.8"
                      />
                    </g>
                  )}
                  {/* ports */}
                  <circle
                    cx="0" cy={NODE_H / 2} r="6"
                    fill="var(--surface-2)" stroke={mode === "connect" ? "var(--accent-2)" : "var(--border)"} strokeWidth="1.6"
                    className={cn(mode === "connect" && "cursor-crosshair")}
                    onPointerDown={(e) => onPort(e, n.id, "in")}
                  />
                  <circle
                    cx={NODE_W} cy={NODE_H / 2} r="6"
                    fill={connectFrom === n.id ? "var(--accent-2)" : "var(--surface-2)"}
                    stroke={mode === "connect" ? "var(--accent)" : "var(--border)"} strokeWidth="1.6"
                    className={cn(mode === "connect" && "cursor-crosshair", connectFrom === n.id && "anim-pulse-soft")}
                    onPointerDown={(e) => onPort(e, n.id, "out")}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </Card>

      {/* ========= inspector ========= */}
      <div className="space-y-4">
        {selectedNode && nodeById.get(selectedNode) && (
          <NodeInspector node={nodeById.get(selectedNode)!} onClose={() => setSelectedNode(null)} />
        )}
        {selectedEdge && (
          <EdgeInspector edge={s.edges.find((e) => e.id === selectedEdge)!} onClose={() => setSelectedEdge(null)} />
        )}
        {!selectedNode && !selectedEdge && (
          <Card>
            <CardHeader title="Inspector" subtitle="select a node or an edge" icon={<Workflow size={15} />} />
            <Empty icon={<Cable size={26} />} title="Nothing selected" hint="Drag nodes to arrange · switch to Wire mode to connect ports · scroll to zoom." />
            <div className="border-t border-border-soft pt-3 mt-2 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-faint font-semibold">Data types on wires</p>
              {Object.entries(EDGE_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="w-3 h-0.5 rounded" style={{ background: v }} />
                  <span className="font-mono">{k}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="Fleet metrics" subtitle="per-app efficiency — updated on every run" icon={<Gauge size={15} />} />
          <div className="space-y-2">
            {s.metrics.map((m) => (
              <div key={m.appId} className="rounded-lg border border-border-soft bg-surface-2 p-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full", m.status === "healthy" ? "bg-ok" : m.status === "degraded" ? "bg-warn" : "bg-faint")} />
                  <span className="text-[12px] font-medium text-ink">{m.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-faint">err {m.errorRate}%</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-muted">
                  <span>{fmtNum(m.ops)} ops</span>
                  <span>p50 {m.p50}ms</span>
                  <span>p95 {m.p95}ms</span>
                  <Sparkline data={m.series.slice(-14)} width={64} height={16} color={m.status === "healthy" ? "var(--observation)" : "var(--warn)"} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

const EDGE_COLORS: Record<OrchestratorEdge["dataType"], string> = {
  facts: "var(--world)",
  prompts: "var(--experience)",
  context: "var(--observation)",
  feedback: "var(--opinion)",
  events: "var(--accent)",
};

function edgeOrder(edges: OrchestratorEdge[], id: string): number {
  return edges.findIndex((e) => e.id === id);
}

function IconSvg({ Icon }: { Icon: React.ElementType }) {
  // lucide icons render their own svg; scale it into the 16px slot
  return <Icon size={16} />;
}

function RefreshSpin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

/* ============ node inspector ============ */

function NodeInspector({ node, onClose }: { node: OrchestratorNode; onClose: () => void }) {
  const s = useSandbox();
  const cat = APP_CATALOG.find((c) => c.appId === node.appId)!;
  const m = s.metrics.find((x) => x.appId === node.appId);
  const [label, setLabel] = useState(node.label);

  return (
    <Card className="anim-fade-up">
      <CardHeader
        title="Node inspector"
        icon={<Plug size={15} />}
        right={<Button size="sm" variant="ghost" onClick={onClose}>✕</Button>}
      />
      <div className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-lg grid place-items-center border" style={{ color: cat.color, borderColor: cat.color + "55", background: `color-mix(in srgb, ${cat.color} 10%, transparent)` }}>
            <cat.icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-faint font-mono">{node.appId}</p>
            <p className="text-[13px] font-semibold text-ink truncate">{cat.label}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1">Label</p>
          <div className="flex gap-1.5">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" variant="outline" className="h-8" onClick={() => {
              useSandbox.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === node.id ? { ...n, label } : n)) }));
              s.logEvent({ app: "orchestrator", op: "orchestrate", message: `Node renamed to "${label}"` });
            }}>
              Set
            </Button>
          </div>
        </div>
        <Toggle
          checked={node.mounted}
          onChange={() => s.toggleMount(node.id)}
          label="Mounted"
          description={node.mounted ? "Active in pipeline runs — receiving and emitting on its wires." : "Unmounted — wires stay but carry no traffic."}
        />
        {cat.href && (
          <Link href={cat.href}>
            <Button variant="outline" size="sm" className="w-full">
              Open app <ArrowUpRight size={12} />
            </Button>
          </Link>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">Config</p>
          <div className="space-y-1.5">
            {Object.entries(node.config).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="chip w-24 truncate">{k}</span>
                <Input
                  defaultValue={String(v)}
                  className="h-7 text-[11px] font-mono flex-1"
                  onBlur={(e) => s.updateNodeConfig(node.id, k, e.target.value)}
                />
              </div>
            ))}
            <AddConfigRow nodeId={node.id} />
          </div>
        </div>
        {m && (
          <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5">
            <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">Live efficiency</p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <span className="text-muted">ops <b className="text-ink">{fmtNum(m.ops)}</b></span>
              <span className="text-muted">p50 <b className="text-ink">{fmtMs(m.p50)}</b></span>
              <span className="text-muted">p95 <b className="text-ink">{fmtMs(m.p95)}</b></span>
              <span className="text-muted">err <b className={m.errorRate > 1.5 ? "text-warn" : "text-ink"}>{m.errorRate}%</b></span>
            </div>
            <div className="mt-2">
              <Sparkline data={m.series} width={230} height={30} color={cat.color} />
            </div>
          </div>
        )}
        <Button variant="danger" size="sm" className="w-full" onClick={() => { s.removeNode(node.id); onClose(); }}>
          <Trash2 size={12} /> Unmount & remove node
        </Button>
      </div>
    </Card>
  );
}

function AddConfigRow({ nodeId }: { nodeId: string }) {
  const s = useSandbox();
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  if (!k && !v)
    return (
      <Button size="sm" variant="ghost" className="w-full h-7 text-[10.5px]" onClick={() => setK("key")}>
        <Plus size={11} /> add config key
      </Button>
    );
  return (
    <div className="flex gap-1.5">
      <Input value={k} onChange={(e) => setK(e.target.value)} placeholder="key" className="h-7 text-[11px] font-mono w-24" />
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="value" className="h-7 text-[11px] font-mono flex-1" />
      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { if (k.trim()) { s.updateNodeConfig(nodeId, k.trim(), v); setK(""); setV(""); } }}>
        <Plus size={11} />
      </Button>
    </div>
  );
}

/* ============ edge inspector ============ */

function EdgeInspector({ edge, onClose }: { edge: OrchestratorEdge; onClose: () => void }) {
  const s = useSandbox();
  const src = s.nodes.find((n) => n.id === edge.source);
  const tgt = s.nodes.find((n) => n.id === edge.target);
  return (
    <Card className="anim-fade-up">
      <CardHeader title="Wire inspector" icon={<Cable size={15} />} right={<Button size="sm" variant="ghost" onClick={onClose}>✕</Button>} />
      <div className="space-y-3.5">
        <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5 text-[11.5px] font-mono text-center">
          <span className="text-ink">{src?.label ?? edge.source}</span>
          <span className="mx-2" style={{ color: EDGE_COLORS[edge.dataType] }}>──▸</span>
          <span className="text-ink">{tgt?.label ?? edge.target}</span>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">Data type</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EDGE_COLORS) as OrchestratorEdge["dataType"][]).map((dt) => (
              <button
                key={dt}
                onClick={() => s.updateEdge(edge.id, { dataType: dt })}
                className={cn("chip cursor-pointer transition-all", edge.dataType === dt && "border-accent-border text-accent bg-accent-soft")}
                style={edge.dataType === dt ? { borderColor: EDGE_COLORS[dt], color: EDGE_COLORS[dt] } : undefined}
              >
                {dt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">Routing strategy</p>
          <Segmented
            size="sm"
            className="w-full [&>button]:flex-1"
            value={edge.routing}
            onChange={(v) => s.updateEdge(edge.id, { routing: v as OrchestratorEdge["routing"] })}
            options={[
              { value: "broadcast", label: "broadcast" },
              { value: "round-robin", label: "round-robin" },
              { value: "priority", label: "priority" },
            ]}
          />
          <p className="text-[10.5px] text-faint mt-1.5 leading-relaxed">
            {edge.routing === "broadcast" && "Every downstream consumer receives each item."}
            {edge.routing === "round-robin" && "Items are distributed evenly across consumers of this wire."}
            {edge.routing === "priority" && "Consumers pull in configured priority order; lower-priority consumers get leftovers."}
          </p>
        </div>
        <Toggle checked={edge.active} onChange={(v) => s.updateEdge(edge.id, { active: v })} label="Active" description={edge.active ? "Carrying traffic during runs." : "Paused — kept for later."} />
        <Button variant="danger" size="sm" className="w-full" onClick={() => { s.disconnect(edge.id); onClose(); }}>
          <Trash2 size={12} /> Cut wire
        </Button>
      </div>
    </Card>
  );
}
