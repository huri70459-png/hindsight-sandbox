"use client";

/* ============================================================
   Zero-dependency SVG charts for the Tier-1 dashboards.
   ============================================================ */

import { useId, useMemo, useState } from "react";
import { cn, fmtNum } from "@/lib/utils";

/* ---------------- Line / Area chart ---------------- */

export interface Series {
  name: string;
  color: string;
  data: number[];
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  height = 180,
  yFormat = fmtNum,
  area = true,
  className,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  yFormat?: (n: number) => string;
  area?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const W = 600;
  const H = height;
  const pad = { l: 38, r: 10, t: 10, b: 22 };
  const [hover, setHover] = useState<number | null>(null);

  const { max, min } = useMemo(() => {
    const all = series.flatMap((s) => s.data);
    return { max: Math.max(1, ...all), min: Math.min(0, ...all) };
  }, [series]);

  const n = Math.max(...series.map((s) => s.data.length), 2);
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = min + t * (max - min);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" strokeWidth="1" />
              <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">
                {yFormat(v)}
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.name}>
              {area && (
                <polygon
                  points={`${x(0)},${H - pad.b} ${pts} ${x(s.data.length - 1)},${H - pad.b}`}
                  fill={`url(#area-${gid}-${s.name.replace(/\W/g, "")})`}
                />
              )}
              <defs>
                <linearGradient id={`area-${gid}-${s.name.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "4 4" : undefined}
              />
            </g>
          );
        })}
        {/* hover capture */}
        {Array.from({ length: n }).map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - pad.l - pad.r) / n / 2}
            y={pad.t}
            width={(W - pad.l - pad.r) / n}
            height={H - pad.t - pad.b}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--border)" strokeWidth="1" />
            {series.map((s) =>
              s.data[hover] !== undefined ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r="3" fill={s.color} stroke="var(--bg)" strokeWidth="1.5" />
              ) : null
            )}
          </g>
        )}
        {labels &&
          labels.map((l, i) =>
            i % Math.ceil(labels.length / 6) === 0 ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--faint)">
                {l}
              </text>
            ) : null
          )}
      </svg>
      {hover !== null && (
        <div
          className="absolute top-1 pointer-events-none rounded-lg border border-border bg-surface/95 backdrop-blur px-2.5 py-1.5 text-[11px] shadow-xl z-10"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > n / 2 ? "translateX(-105%)" : "translateX(8px)" }}
        >
          {labels?.[hover] && <div className="text-faint mb-0.5">{labels[hover]}</div>}
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-muted">{s.name}</span>
              <span className="text-ink font-mono ml-auto pl-2">{yFormat(s.data[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-4 mt-1 pl-9">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Horizontal bar chart ---------------- */

export interface BarItem {
  label: string;
  value: number;
  value2?: number;
  color?: string;
  color2?: string;
  highlight?: boolean;
}

export function HBarChart({
  items,
  max,
  unit = "",
  legend,
  className,
}: {
  items: BarItem[];
  max?: number;
  unit?: string;
  legend?: [string, string];
  className?: string;
}) {
  const m = max ?? Math.max(...items.flatMap((i) => [i.value, i.value2 ?? 0])) * 1.08;
  return (
    <div className={cn("space-y-2.5", className)}>
      {legend && (
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "linear-gradient(90deg,var(--accent),var(--accent-2))" }} />
            {legend[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-surface-3 border border-border" />
            {legend[1]}
          </span>
        </div>
      )}
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={cn("truncate", it.highlight ? "text-ink font-semibold" : "text-muted")}>{it.label}</span>
            <span className="font-mono text-ink tabular-nums ml-2 shrink-0">
              {it.value}
              {unit}
              {it.value2 !== undefined && <span className="text-faint"> / {it.value2}{unit}</span>}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-2 border border-border-soft overflow-hidden">
            {it.value2 !== undefined && (
              <div className="absolute inset-y-0 left-0 rounded-full bg-surface-3" style={{ width: `${(it.value2 / m) * 100}%` }} />
            )}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${(it.value / m) * 100}%`,
                background: it.color ?? "linear-gradient(90deg,var(--accent),var(--accent-2))",
                opacity: it.value2 !== undefined ? 1 : 0.9,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Vertical grouped bars ---------------- */

export function VBars({
  groups,
  height = 170,
  unit = "",
  className,
}: {
  groups: { label: string; values: { name: string; value: number; color: string }[] }[];
  height?: number;
  unit?: string;
  className?: string;
}) {
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 8, t: 8, b: 34 };
  const max = Math.max(...groups.flatMap((g) => g.values.map((v) => v.value))) * 1.1 || 1;
  const gw = (W - pad.l - pad.r) / groups.length;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className={cn(className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + t * (H - pad.t - pad.b)} y2={pad.t + t * (H - pad.t - pad.b)} stroke="var(--border-soft)" />
            <text x={pad.l - 5} y={pad.t + t * (H - pad.t - pad.b) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">
              {Math.round(max * (1 - t))}
              {unit}
            </text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const bw = Math.min(26, (gw - 12) / g.values.length);
          return (
            <g key={g.label}>
              {g.values.map((v, vi) => {
                const h = (v.value / max) * (H - pad.t - pad.b);
                const bx = pad.l + gi * gw + (gw - bw * g.values.length) / 2 + vi * bw;
                return (
                  <rect
                    key={v.name}
                    x={bx}
                    y={H - pad.b - h}
                    width={bw - 2}
                    height={Math.max(1, h)}
                    rx={2}
                    fill={v.color}
                    opacity={hover && hover !== `${g.label}|${v.name}` ? 0.45 : 0.92}
                    onMouseEnter={() => setHover(`${g.label}|${v.name}`)}
                    onMouseLeave={() => setHover(null)}
                    className="transition-opacity"
                  />
                );
              })}
              <text x={pad.l + gi * gw + gw / 2} y={H - pad.b + 14} textAnchor="middle" fontSize="9" fill="var(--faint)">
                {g.label.length > 16 ? g.label.slice(0, 15) + "…" : g.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="text-center text-[11px] text-muted -mt-1">
          <span className="text-ink font-medium">{hover.split("|")[0]}</span> · {hover.split("|")[1]}:{" "}
          <span className="font-mono text-accent">
            {groups.find((g) => g.label === hover.split("|")[0])?.values.find((v) => v.name === hover.split("|")[1])?.value}
            {unit}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Donut ---------------- */

export function Donut({
  slices,
  size = 150,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        {slices.map((s) => {
          const frac = s.value / total;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === s.label ? thickness + 4 : thickness}
              strokeDasharray={`${frac * c - 2} ${c - frac * c + 2}`}
              strokeDashoffset={-offset * c}
              strokeLinecap="round"
              className="transition-all cursor-pointer"
              opacity={hover && hover !== s.label ? 0.4 : 1}
              onMouseEnter={() => setHover(s.label)}
              onMouseLeave={() => setHover(null)}
            />
          );
          offset += frac;
          return el;
        })}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text)" className="rotate-90" style={{ transformOrigin: "center" }}>
          {hover ? slices.find((s) => s.label === hover)?.value : centerValue}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="9" fill="var(--faint)" className="rotate-90" style={{ transformOrigin: "center" }}>
          {hover ?? centerLabel}
        </text>
      </svg>
      <div className="space-y-1.5 min-w-0">
        {slices.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 text-xs cursor-pointer"
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className={cn("truncate", hover === s.label ? "text-ink" : "text-muted")}>{s.label}</span>
            <span className="ml-auto font-mono text-ink tabular-nums">{s.value}</span>
            <span className="text-faint tabular-nums w-9 text-right">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Radial gauge ---------------- */

export function Gauge({
  value,
  max = 100,
  label,
  size = 110,
  color,
}: {
  value: number;
  max?: number;
  label?: string;
  size?: number;
  color?: string;
}) {
  const frac = Math.min(1, value / max);
  const r = size / 2 - 9;
  const circ = Math.PI * r; // half circle
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={`M 9 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 9} ${size / 2 + 4}`} fill="none" stroke="var(--surface-3)" strokeWidth="8" strokeLinecap="round" />
        <path
          d={`M 9 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 9} ${size / 2 + 4}`}
          fill="none"
          stroke={color ?? "var(--accent)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${frac * circ} ${circ}`}
          className="transition-all duration-700"
        />
        <text x={size / 2} y={size / 2 + 2} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text)" className="tabular-nums">
          {value % 1 === 0 ? value : value.toFixed(1)}
        </text>
      </svg>
      {label && <span className="text-[11px] text-muted -mt-1">{label}</span>}
    </div>
  );
}

/* ---------------- Scatter (frontier charts) ---------------- */

export function Scatter({
  points,
  xLog = true,
  yLog = true,
  xLabel,
  yLabel,
  height = 260,
  xFormat = (v: number) => String(Math.round(v)),
  yFormat = (v: number) => String(Math.round(v)),
  className,
}: {
  points: { x: number; y: number; label: string; size?: number; color?: string; ours?: boolean }[];
  xLog?: boolean;
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  className?: string;
}) {
  const W = 600;
  const H = height;
  const pad = { l: 46, r: 16, t: 16, b: 40 };
  const [hover, setHover] = useState<string | null>(null);

  const tf = (v: number, log: boolean) => (log ? Math.log10(Math.max(v, 0.05)) : v);
  const xs = points.map((p) => tf(p.x, xLog));
  const ys = points.map((p) => tf(p.y, yLog));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const X = (v: number) => pad.l + ((tf(v, xLog) - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => H - pad.b - ((tf(v, yLog) - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* grid */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={`h${t}`} x1={pad.l} x2={W - pad.r} y1={pad.t + t * (H - pad.t - pad.b)} y2={pad.t + t * (H - pad.t - pad.b)} stroke="var(--border-soft)" />
        ))}
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={`v${t}`} y1={pad.t} y2={H - pad.b} x1={pad.l + t * (W - pad.l - pad.r)} x2={pad.l + t * (W - pad.l - pad.r)} stroke="var(--border-soft)" />
        ))}
        {points.map((p) => (
          <g key={p.label} onMouseEnter={() => setHover(p.label)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
            <circle
              cx={X(p.x)}
              cy={Y(p.y)}
              r={(p.size ?? 7) + (hover === p.label ? 2 : 0)}
              fill={p.color ?? (p.ours ? "var(--accent)" : "var(--faint)")}
              opacity={hover && hover !== p.label ? 0.35 : 0.85}
              stroke={p.ours ? "var(--accent-2)" : "none"}
              strokeWidth={p.ours ? 2 : 0}
              className="transition-all"
            />
            <text x={X(p.x)} y={Y(p.y) - (p.size ?? 7) - 5} textAnchor="middle" fontSize="9.5" fill={hover === p.label ? "var(--text)" : "var(--muted)"} fontWeight={p.ours ? 600 : 400}>
              {p.label}
            </text>
          </g>
        ))}
        {xLabel && (
          <text x={(W + pad.l) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={12} y={H / 2} textAnchor="middle" fontSize="10" fill="var(--faint)" transform={`rotate(-90 12 ${H / 2})`}>
            {yLabel}
          </text>
        )}
        <text x={pad.l - 5} y={Y(Math.pow(10, yMin)) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">
          {yFormat(yLog ? Math.pow(10, yMin) : yMin)}
        </text>
        <text x={pad.l - 5} y={Y(Math.pow(10, yMax)) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">
          {yFormat(yLog ? Math.pow(10, yMax) : yMax)}
        </text>
        <text x={X(xLog ? Math.pow(10, xMin) : xMin)} y={H - pad.b + 16} textAnchor="middle" fontSize="9" fill="var(--faint)">
          {xFormat(xLog ? Math.pow(10, xMin) : xMin)}
        </text>
        <text x={X(xLog ? Math.pow(10, xMax) : xMax)} y={H - pad.b + 16} textAnchor="middle" fontSize="9" fill="var(--faint)">
          {xFormat(xLog ? Math.pow(10, xMax) : xMax)}
        </text>
      </svg>
      {hover && (() => {
        const p = points.find((pt) => pt.label === hover)!;
        return (
          <div className="absolute top-2 right-2 rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-[11px] shadow-xl pointer-events-none">
            <div className="text-ink font-semibold">{p.label}</div>
            <div className="text-muted font-mono mt-0.5">
              x: {xFormat(p.x)} · y: {yFormat(p.y)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Latency histogram ---------------- */

export function Histogram({ data, bins = 12, color = "var(--accent)", height = 90, label }: { data: number[]; bins?: number; color?: string; height?: number; label?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const counts = new Array(bins).fill(0);
  for (const v of data) {
    const b = Math.min(bins - 1, Math.floor(((v - min) / (max - min || 1)) * bins));
    counts[b]++;
  }
  const m = Math.max(...counts);
  return (
    <div>
      {label && <p className="text-[10px] uppercase tracking-wider text-faint mb-1.5">{label}</p>}
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all duration-500"
            style={{ height: `${Math.max(3, (c / m) * 100)}%`, background: color, opacity: 0.35 + (c / m) * 0.65 }}
            title={`${(min + ((max - min) * i) / bins).toFixed(0)}–${(min + ((max - min) * (i + 1)) / bins).toFixed(0)}: ${c}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-faint font-mono mt-1">
        <span>{Math.round(min)}</span>
        <span>{Math.round(max)}</span>
      </div>
    </div>
  );
}
