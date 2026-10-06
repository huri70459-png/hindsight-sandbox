"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft, Database, Gauge, GraduationCap, LayoutDashboard, Moon,
  Settings2, SlidersHorizontal, Sparkles, Sun, Workflow, RotateCcw, FlaskConical, Cable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSandbox } from "@/lib/store";
import { SAMPLE_RETAIN_TEXTS } from "@/lib/data/seed";

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: React.ElementType;
  action: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setUi, ui, retain, resetDemo } = useSandbox();

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    return [
      { id: "dash", label: "Go to Dashboard", group: "Navigate", icon: LayoutDashboard, action: go("/sandbox") },
      { id: "mem", label: "Go to Memory App", group: "Navigate", icon: Database, action: go("/sandbox/memory") },
      { id: "prompt", label: "Go to Prompt Studio", group: "Navigate", icon: Sparkles, action: go("/sandbox/prompts") },
      { id: "ctx", label: "Go to Context Tuning", group: "Navigate", icon: SlidersHorizontal, action: go("/sandbox/context") },
      { id: "learn", label: "Go to Continuous Learning", group: "Navigate", icon: GraduationCap, action: go("/sandbox/learning") },
      { id: "orch", label: "Go to Orchestrator", group: "Navigate", icon: Workflow, action: go("/sandbox/orchestrator") },
      { id: "eval", label: "Go to Evaluation", group: "Navigate", icon: FlaskConical, action: go("/sandbox/eval") },
      { id: "bench", label: "Go to Benchmarks", group: "Navigate", icon: Gauge, action: go("/sandbox/benchmarks") },
      { id: "integrations", label: "Go to Integrations", group: "Navigate", icon: Cable, action: go("/sandbox/integrations") },
      { id: "settings", label: "Go to Settings", group: "Navigate", icon: Settings2, action: go("/sandbox/settings") },
      {
        id: "theme",
        label: `Switch to ${ui.theme === "dark" ? "light" : "dark"} theme`,
        group: "Actions",
        icon: ui.theme === "dark" ? Sun : Moon,
        action: () => {
          setUi({ theme: ui.theme === "dark" ? "light" : "dark" });
          onClose();
        },
      },
      ...SAMPLE_RETAIN_TEXTS.map((s, i) => ({
        id: `retain-${i}`,
        label: `Retain sample: ${s.label}`,
        group: "Actions",
        icon: Database,
        action: () => {
          retain(s.text);
          router.push("/sandbox/memory");
          onClose();
        },
      })),
      {
        id: "reset",
        label: "Reset demo data",
        group: "Actions",
        icon: RotateCcw,
        action: () => {
          resetDemo();
          onClose();
        },
      },
    ];
  }, [router, onClose, setUi, ui.theme, retain, resetDemo]);

  const filtered = useMemo(() => {
    if (!q.trim()) return cmds;
    const s = q.toLowerCase();
    return cmds.filter((c) => c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s));
  }, [q, cmds]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const groups = [...new Set(filtered.map((c) => c.group))];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg card glow-ring overflow-hidden anim-fade-up shadow-2xl">
        <div className="flex items-center gap-2.5 px-4 border-b border-border-soft">
          <Sparkles size={15} className="text-accent shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && filtered[sel]) { filtered[sel].action(); }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Type a command or search…"
            className="flex-1 h-12 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <span className="chip">esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-faint font-semibold">{g}</p>
              {filtered
                .filter((c) => c.group === g)
                .map((c) => {
                  const idx = filtered.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      onClick={c.action}
                      onMouseEnter={() => setSel(idx)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors text-left",
                        sel === idx ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"
                      )}
                    >
                      <c.icon size={14} className="shrink-0" />
                      <span className="truncate">{c.label}</span>
                      {sel === idx && <CornerDownLeft size={12} className="ml-auto shrink-0 opacity-60" />}
                    </button>
                  );
                })}
            </div>
          ))}
          {!filtered.length && <p className="text-center text-xs text-faint py-8">No matching commands</p>}
        </div>
      </div>
    </div>
  );
}
