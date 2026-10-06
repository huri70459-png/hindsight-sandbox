"use client";

/* Animated hero memory graph — nodes in the four networks,
   links that pulse, mimicking a live bank's memory graph. */

import { useEffect, useMemo, useState } from "react";
import { rng } from "@/lib/utils";

interface GNode {
  id: string;
  label: string;
  net: "world" | "experience" | "observation" | "opinion" | "entity";
  x: number;
  y: number;
  r: number;
}

const COLORS: Record<GNode["net"], string> = {
  world: "#38bdf8",
  experience: "#a78bfa",
  observation: "#34d399",
  opinion: "#fbbf24",
  entity: "#64748b",
};

export function HeroGraph() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 90);
    return () => clearInterval(id);
  }, []);

  const { nodes, edges } = useMemo(() => {
    const r = rng(2024);
    const defs: [string, GNode["net"], number, number, number][] = [
      ["Alice", "entity", 300, 150, 13],
      ["Google", "entity", 452, 96, 11],
      ["works at · Mar 2026", "world", 372, 226, 8],
      ["Microsoft", "entity", 168, 84, 9],
      ["ranking services", "world", 120, 190, 7],
      ["I recommended Alice", "experience", 258, 306, 8],
      ["Python", "entity", 486, 258, 10],
      ["prefers Python", "world", 434, 330, 7],
      ["Alice: Python-focused…", "observation", 330, 396, 10],
      ["React → Vue switch", "observation", 176, 372, 9],
      ["Python is best for DS", "opinion", 540, 386, 9],
      ["Redis → SSPL", "world", 604, 180, 7],
      ["Valkey fork", "world", 640, 280, 7],
      ["consider Valkey", "opinion", 588, 96, 8],
      ["payments rewrite", "world", 700, 120, 6],
      ["Rust", "entity", 726, 240, 9],
    ];
    const nodes: GNode[] = defs.map(([label, net, x, y, rr], i) => ({
      id: `n${i}`,
      label,
      net,
      x: x * (r() * 0.04 + 0.98),
      y: y * (r() * 0.04 + 0.98),
      r: rr,
    }));
    const edgeDefs: [number, number][] = [
      [0, 1], [0, 2], [1, 2], [0, 3], [3, 4], [0, 5], [2, 5], [0, 6], [6, 7],
      [7, 8], [0, 8], [0, 9], [8, 9], [6, 10], [7, 10], [1, 11], [11, 12],
      [12, 13], [11, 13], [12, 10], [11, 14], [14, 15], [12, 15], [5, 8],
    ];
    const edges = edgeDefs.map(([a, b], i) => ({ id: `e${i}`, a: nodes[a], b: nodes[b], i }));
    return { nodes, edges };
  }, []);

  const activeEdge = t % edges.length;
  const W = 800;
  const H = 470;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Live memory graph illustration">
      <defs>
        <radialGradient id="hg-glow" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="hg-blur">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={W} height={H} fill="url(#hg-glow)" rx="20" />
      {edges.map((e, idx) => {
        const active = idx === activeEdge || idx === (activeEdge + 7) % edges.length;
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2 - 14;
        return (
          <g key={e.id}>
            <path
              id={`path-${e.id}`}
              d={`M ${e.a.x} ${e.a.y} Q ${mx} ${my} ${e.b.x} ${e.b.y}`}
              fill="none"
              stroke={active ? "var(--accent)" : "var(--border)"}
              strokeWidth={active ? 1.4 : 0.9}
              opacity={active ? 0.9 : 0.5}
              className={active ? "anim-dash" : undefined}
            />
            {active && (
              <circle r="2.6" fill="var(--accent-2)" filter="url(#hg-blur)">
                <animateMotion dur="1.4s" repeatCount="indefinite" path={`M ${e.a.x} ${e.a.y} Q ${mx} ${my} ${e.b.x} ${e.b.y}`} />
              </circle>
            )}
          </g>
        );
      })}
      {nodes.map((n, i) => {
        const float = Math.sin((t + i * 7) / 9) * 2.2;
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y + float})`}>
            {(n.net === "observation" || n.net === "opinion") && (
              <circle r={n.r + 5} fill="none" stroke={COLORS[n.net]} strokeWidth="1" opacity="0.3" className="anim-pulse-soft" />
            )}
            <circle r={n.r} fill={`color-mix(in srgb, ${COLORS[n.net]} 22%, var(--surface))`} stroke={COLORS[n.net]} strokeWidth="1.3" />
            <circle r={Math.max(2, n.r * 0.3)} fill={COLORS[n.net]} opacity="0.9" />
            <text y={n.r + 13} textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontFamily="var(--font-jetbrains), monospace">
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
