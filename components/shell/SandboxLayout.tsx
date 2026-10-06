"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Database, Eye, Gauge, GraduationCap, LayoutDashboard, Search, SlidersHorizontal,
  Sparkles, Workflow, Settings2, ChevronsLeft, ChevronsRight, Sun, Moon, Command, ExternalLink, FlaskConical, Cable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSandbox } from "@/lib/store";
import { ThemeSync } from "./ThemeBootstrap";
import { CommandPalette } from "./CommandPalette";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ href: "/sandbox", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    group: "Apps",
    items: [
      { href: "/sandbox/memory", label: "Memory", icon: Database },
      { href: "/sandbox/prompts", label: "Prompt Studio", icon: Sparkles },
      { href: "/sandbox/context", label: "Context Tuning", icon: SlidersHorizontal },
      { href: "/sandbox/learning", label: "Continuous Learning", icon: GraduationCap },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/sandbox/orchestrator", label: "Orchestrator", icon: Workflow },
      { href: "/sandbox/eval", label: "Evaluation", icon: FlaskConical },
      { href: "/sandbox/benchmarks", label: "Benchmarks", icon: Gauge },
      { href: "/sandbox/integrations", label: "Integrations", icon: Cable },
      { href: "/sandbox/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSandbox((s) => s.ui.sidebarCollapsed);
  const setUi = useSandbox((s) => s.setUi);
  const ui = useSandbox((s) => s.ui);
  const banks = useSandbox((s) => s.banks);
  const activeBankId = useSandbox((s) => s.activeBankId);
  const setActiveBank = useSandbox((s) => s.setActiveBank);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = NAV.flatMap((g) => g.items).find((i) =>
    i.exact ? pathname === i.href : pathname.startsWith(i.href)
  );

  return (
    <div className="min-h-screen flex bg-bg">
      <ThemeSync />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ============ Sidebar ============ */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 border-r border-border-soft bg-bg-soft flex flex-col transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("h-14 flex items-center border-b border-border-soft px-3 gap-2", collapsed && "justify-center px-0")}>
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] grid place-items-center text-white shrink-0 shadow-[0_0_16px_-4px_var(--glow)]">
              <Eye size={16} />
            </span>
            {!collapsed && (
              <span className="font-bold text-sm tracking-tight text-ink truncate">
                Hindsight <span className="text-accent">Sandbox</span>
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV.map((g) => (
            <div key={g.group}>
              {!collapsed && (
                <p className="px-2.5 mb-1.5 text-[10px] uppercase tracking-widest text-faint font-semibold">{g.group}</p>
              )}
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all group relative",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-accent-soft text-accent border border-accent-border/50"
                          : "text-muted hover:text-ink hover:bg-surface-2 border border-transparent"
                      )}
                    >
                      <item.icon size={16} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {active && !collapsed && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--glow)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("p-2 border-t border-border-soft space-y-1", collapsed && "flex flex-col items-center")}>
          <button
            onClick={() => setUi({ theme: ui.theme === "dark" ? "light" : "dark" })}
            title="Toggle theme"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:text-ink hover:bg-surface-2 w-full transition-colors",
              collapsed && "justify-center px-0 w-10"
            )}
          >
            {ui.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {!collapsed && <span>{ui.theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>
          <Link
            href="/"
            title="Landing page"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:text-ink hover:bg-surface-2 w-full transition-colors",
              collapsed && "justify-center px-0 w-10"
            )}
          >
            <ExternalLink size={15} />
            {!collapsed && <span>Landing page</span>}
          </Link>
          <button
            onClick={() => setUi({ sidebarCollapsed: !collapsed })}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-faint hover:text-ink hover:bg-surface-2 w-full transition-colors",
              collapsed && "justify-center px-0 w-10"
            )}
          >
            {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ============ Main ============ */}
      <div className={cn("flex-1 flex flex-col min-w-0 transition-all duration-200", collapsed ? "ml-16" : "ml-60")}>
        <header className="sticky top-0 z-30 h-14 glass border-b border-border-soft flex items-center gap-3 px-5">
          <div className="flex items-center gap-2 min-w-0">
            {current && (
              <>
                <current.icon size={15} className="text-accent shrink-0" />
                <h1 className="text-sm font-semibold text-ink truncate">{current.label}</h1>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* bank switcher */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 h-8">
              <Database size={13} className="text-faint" />
              <select
                value={activeBankId}
                onChange={(e) => setActiveBank(e.target.value)}
                className="bg-transparent text-xs text-ink outline-none cursor-pointer font-medium max-w-32"
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id} className="bg-surface text-ink">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 h-8 text-xs text-faint hover:text-ink hover:border-accent-border transition-colors"
            >
              <Search size={13} />
              <span className="hidden md:inline">Search or jump to…</span>
              <span className="hidden md:flex items-center gap-0.5 ml-2">
                <Command size={10} />K
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 min-w-0">{children}</main>
      </div>
    </div>
  );
}
