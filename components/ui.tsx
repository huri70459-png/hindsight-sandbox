"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

/* ---------------- Button ---------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "text-white border-transparent bg-[linear-gradient(100deg,var(--accent),var(--accent-2))] hover:opacity-90 shadow-[0_4px_20px_-6px_var(--glow)]",
  secondary: "bg-surface-2 text-ink border-border hover:bg-surface-3",
  ghost: "bg-transparent text-muted border-transparent hover:text-ink hover:bg-surface-2",
  outline: "bg-transparent text-ink border-border hover:border-accent-border hover:bg-accent-soft",
  danger: "bg-danger/15 text-danger border-danger/30 hover:bg-danger/25",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-8 w-8 rounded-lg justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center font-medium transition-all duration-150 select-none",
        "disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
        "border",
        buttonStyles[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    />
  );
});

/* ---------------- Card ---------------- */

export function Card({ className, children, glow, ...props }: HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div className={cn("card p-4", glow && "glow-ring", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, right }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && <div className="mt-0.5 text-accent shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ---------------- Badge ---------------- */

export function Badge({
  children,
  color,
  className,
  soft = true,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  soft?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap", className)}
      style={
        color
          ? soft
            ? { color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }
            : { color: "#fff", background: color, borderColor: color }
          : { color: "var(--muted)", borderColor: "var(--border)", background: "var(--surface-2)" }
      }
    >
      {children}
    </span>
  );
}

/* ---------------- Inputs ---------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-ink placeholder:text-faint",
        "outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-soft transition-all",
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint",
        "outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-soft transition-all resize-y",
        className
      )}
      {...props}
    />
  );
});

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-sm text-ink outline-none",
        "focus:border-accent-border focus:ring-2 focus:ring-accent-soft transition-all cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ---------------- Segmented control ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-surface-2 p-0.5 gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-all",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
            value === o.value
              ? "bg-accent-soft text-accent border border-accent-border"
              : "text-muted hover:text-ink border border-transparent"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Toggle ---------------- */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm text-ink group-hover:text-accent transition-colors">{label}</span>}
          {description && <span className="block text-xs text-muted mt-0.5 leading-relaxed">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-5 rounded-full border transition-all shrink-0",
          checked ? "bg-accent-soft border-accent-border" : "bg-surface-3 border-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all",
            checked ? "left-[18px] bg-accent shadow-[0_0_8px_var(--glow)]" : "left-0.5 bg-faint"
          )}
        />
      </button>
    </label>
  );
}

/* ---------------- Slider ---------------- */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: ReactNode;
  format?: (v: number) => string;
}) {
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted">{label}</span>
          <span className="text-xs font-mono text-accent">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ---------------- Progress ---------------- */

export function Progress({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color ?? "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
      />
    </div>
  );
}

/* ---------------- Stat ---------------- */

export function Stat({
  label,
  value,
  delta,
  icon,
  spark,
  color,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: number; suffix?: string };
  icon?: ReactNode;
  spark?: number[];
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden group hover:border-accent-border transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-faint font-medium">{label}</p>
          <p className="text-2xl font-bold text-ink mt-1 tabular-nums" style={color ? { color } : undefined}>
            {value}
          </p>
          {delta && (
            <p className={cn("text-[11px] mt-1 font-medium", delta.value >= 0 ? "text-ok" : "text-danger")}>
              {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(1)}
              {delta.suffix ?? "%"} <span className="text-faint font-normal">vs last hr</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {icon && (
            <div className="p-2 rounded-lg bg-accent-soft text-accent border border-accent-border/40">{icon}</div>
          )}
          {spark && spark.length > 1 && <Sparkline data={spark} width={72} height={24} color={color ?? "var(--accent)"} />}
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Sparkline (tiny, used by Stat) ---------------- */

export function Sparkline({ data, width = 72, height = 24, color = "var(--accent)" }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`);
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}-${width}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Tabs ---------------- */

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-border-soft overflow-x-auto", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
            active === t.id ? "text-accent" : "text-muted hover:text-ink"
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-surface-3 text-faint tabular-nums">{t.count}</span>
          )}
          {active === t.id && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-faint mb-3 opacity-60">{icon}</div>}
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="text-xs text-faint mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

/* ---------------- Kbd ---------------- */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[10px] font-mono text-faint">
      {children}
    </kbd>
  );
}
