"use client";

/* Interactive memory graph: facts colored by network, entities as
   hubs, edges by link type. Deterministic radial layout. */

import { useMemo, useState } from "react";
import type { GraphLink, MemoryFact } from "@/lib/types";
import { NETWORK_META, LINK_META, cn } from "@/lib/utils";

export interface GraphSelection {
  kind: "fact" | "entity";
  id: string;
}

export function MemoryGraph({
  facts,
  links,
  height = 460,
  selected,
  onSelect,
}: {
  facts: MemoryFact[];
  links: GraphLink[];
  height?: number;
  selected?: GraphSelection | null;
  onSelect?: (s: GraphSelection | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [linkFilter, setLinkFilter] = useState<Set<string>>(new Set(["entity", "temporal", "semantic", "causal"]));

  const W = 900;
  const H = height;

  const layout = useMemo(() => {
    // entities as hubs on an outer ring; facts clustered near their entities
    const entityNames = [...new Set(facts.flatMap((f) => f.entities))].slice(0, 14);
    const cx = W / 2;
    const cy = H / 2;
    const entityPos = new Map<string, { x: number; y: number }>();
    entityNames.forEach((e, i) => {
      const a = (i / entityNames.length) * Math.PI * 2 - Math.PI / 2;
      entityPos.set(e, { x: cx + Math.cos(a) * (W * 0.33), y: cy + Math.sin(a) * (H * 0.38) });
    });
    const factPos = new Map<string, { x: number; y: number }>();
    facts.forEach((f, i) => {
      const anchor = f.entities.map((e) => entityPos.get(e)).find(Boolean);
      if (anchor) {
        const jitterA = (i * 137.5 * Math.PI) / 180;
        const r = 34 + (i % 5) * 16;
        factPos.set(f.id, {
          x: Math.max(30, Math.min(W - 30, anchor.x + Math.cos(jitterA) * r)),
          y: Math.max(26, Math.min(H - 26, anchor.y + Math.sin(jitterA) * r)),
        });
      } else {
        const a = (i / facts.length) * Math.PI * 2;
        factPos.set(f.id, { x: cx + Math.cos(a) * 70, y: cy + Math.sin(a) * 55 });
      }
    });
    return { entityPos, factPos, entityNames };
  }, [facts, H]);

  const visibleLinks = links.filter((l) => linkFilter.has(l.type) && layout.factPos.has(l.source) && layout.factPos.has(l.target));

  const highlighted = useMemo(() => {
    if (!selected && !hover) return null;
    const id = selected?.kind === "fact" ? selected.id : hover;
    if (!id) return null;
    const set = new Set<string>([id]);
    for (const l of visibleLinks) {
      if (l.source === id || l.target === id) {
        set.add(l.source);
        set.add(l.target);
      }
    }
    return set;
  }, [selected, hover, visibleLinks]);

  return (
    <div className="relative">
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1.5">
        {(Object.keys(LINK_META) as (keyof typeof LINK_META)[]).map((t) => (
          <button
            key={t}
            onClick={() =>
              setLinkFilter((prev) => {
                const n = new Set(prev);
                if (n.has(t)) n.delete(t);
                else n.add(t);
                return n;
              })
            }
            className={cn(
              "chip transition-all cursor-pointer",
              !linkFilter.has(t) && "opacity-35 line-through"
            )}
            style={{ color: LINK_META[t].color, borderColor: LINK_META[t].color + "55" }}
          >
            {LINK_META[t].label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-border-soft bg-bg-soft dot-grid" style={{ height }}>
        {/* edges */}
        {visibleLinks.map((l) => {
          const a = layout.factPos.get(l.source)!;
          const b = layout.factPos.get(l.target)!;
          const dim = highlighted && !(highlighted.has(l.source) && highlighted.has(l.target));
          return (
            <line
              key={l.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={LINK_META[l.type].color}
              strokeWidth={l.type === "causal" ? 1.6 : 0.9}
              strokeOpacity={dim ? 0.05 : l.type === "entity" ? 0.5 : 0.3}
              strokeDasharray={l.type === "temporal" ? "3 4" : l.type === "causal" ? "6 3" : undefined}
            />
          );
        })}
        {/* entity hubs */}
        {[...layout.entityPos.entries()].map(([name, p]) => (
          <g key={name} transform={`translate(${p.x},${p.y})`} className="cursor-pointer"
            onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(selected?.id === name ? null : { kind: "entity", id: name })}>
            <circle r="4" fill="var(--faint)" opacity={highlighted ? 0.4 : 0.8} />
            <text y="-9" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--muted)" fontFamily="var(--font-jetbrains), monospace">
              {name.length > 16 ? name.slice(0, 15) + "…" : name}
            </text>
          </g>
        ))}
        {/* fact nodes */}
        {facts.map((f) => {
          const p = layout.factPos.get(f.id);
          if (!p) return null;
          const dim = highlighted && !highlighted.has(f.id);
          const isSel = selected?.kind === "fact" && selected.id === f.id;
          const color = NETWORK_META[f.network].color;
          const r = isSel ? 8 : 5.5 + Math.min(3, f.accessCount / 8);
          return (
            <g
              key={f.id}
              transform={`translate(${p.x},${p.y})`}
              className="cursor-pointer"
              opacity={dim ? 0.15 : 1}
              onMouseEnter={() => setHover(f.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(isSel ? null : { kind: "fact", id: f.id })}
            >
              {isSel && <circle r={r + 5} fill="none" stroke={color} strokeWidth="1.2" className="anim-pulse-soft" />}
              <circle r={r} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.5" />
              {f.network === "opinion" && <circle r="1.8" fill={color} />}
            </g>
          );
        })}
        {/* hover tooltip */}
        {hover && (() => {
          const f = facts.find((x) => x.id === hover);
          const p = f ? layout.factPos.get(f.id) : layout.entityPos.get(hover);
          if (!p) return null;
          const label = f ? f.text : `Entity: ${hover}`;
          const w = Math.min(300, label.length * 5.6 + 24);
          return (
            <g transform={`translate(${Math.min(p.x, W - w - 8)},${Math.max(p.y - 52, 8)})`} pointerEvents="none">
              <rect width={w} height="42" rx="8" fill="var(--surface)" stroke="var(--border)" opacity="0.97" />
              <foreignObject width={w - 14} height="36" x="7" y="4">
                <div style={{ fontSize: 10, lineHeight: 1.35, color: "var(--muted)" }}>
                  <span style={{ color: f ? NETWORK_META[f.network].color : "var(--ink)", fontWeight: 600 }}>
                    {f ? NETWORK_META[f.network].label : "Entity"} ·{" "}
                  </span>
                  {label.slice(0, 110)}
                  {label.length > 110 ? "…" : ""}
                </div>
              </foreignObject>
            </g>
          );
        })()}
      </svg>
      <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
        {(Object.keys(NETWORK_META) as (keyof typeof NETWORK_META)[]).map((n) => (
          <span key={n} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: NETWORK_META[n].color }} />
            {NETWORK_META[n].label}
          </span>
        ))}
        <span className="text-[11px] text-faint ml-auto font-mono">
          {facts.length} nodes · {visibleLinks.length} edges — click a node to inspect
        </span>
      </div>
    </div>
  );
}
