"use client";

/* Memory App — retain / recall / reflect over the four networks,
   with browser, graph, observations and opinions views. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit, Database, GitBranch, Layers, Play, Plus, RefreshCw, Search,
  Sparkles, Trash2, TrendingDown, TrendingUp, Minus, MessageSquareQuote, ShieldCheck,
  ThumbsUp, ThumbsDown, CalendarClock, ImagePlus, X, Network as NetworkIcon,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Progress, Segmented, Tabs, Textarea, Toggle } from "@/components/ui";
import { RecallTraceView } from "@/components/memory/RecallTrace";
import { MemoryGraph, type GraphSelection } from "@/components/memory/MemoryGraph";
import { FilterBuilder } from "@/components/memory/FilterBuilder";
import { matchesFilters, validateFilters } from "@/lib/engine/filters";
import { useSandbox } from "@/lib/store";
import { recall } from "@/lib/engine/recall";
import { reflect } from "@/lib/engine/reflect";
import { buildEntityIndex, entityBoostSignal } from "@/lib/engine/entities";
import { cn, formatDate, fmtMs, NETWORK_META, timeAgo } from "@/lib/utils";
import type { FilterNode, MemoryFact, Network, RecallTrace, ReflectResult } from "@/lib/types";
import { SAMPLE_RETAIN_TEXTS } from "@/lib/data/seed";

type Tab = "retain" | "browser" | "graph" | "recall" | "reflect" | "observations" | "opinions" | "entities";

export default function MemoryPage() {
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  const [tab, setTab] = useState<Tab>("retain");
  const [recallSeed, setRecallSeed] = useState<string | null>(null);

  const bank = s.banks.find((b) => b.id === s.activeBankId)!;
  const facts = useMemo(() => s.facts.filter((f) => f.bankId === s.activeBankId), [s.facts, s.activeBankId]);
  const observations = useMemo(() => s.observations.filter((o) => o.bankId === s.activeBankId), [s.observations, s.activeBankId]);
  const opinions = useMemo(() => s.opinions.filter((o) => o.bankId === s.activeBankId), [s.opinions, s.activeBankId]);
  const bankLinks = useMemo(() => {
    const ids = new Set(facts.map((f) => f.id));
    return s.links.filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [s.links, facts]);
  const entityIndex = useMemo(() => buildEntityIndex(facts), [facts]);

  if (!hydrated) return <Empty title="Restoring sandbox state…" />;

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* bank header */}
      <Card className="flex flex-wrap items-center gap-4 py-3">
        <div className="w-10 h-10 rounded-xl bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] grid place-items-center text-white shrink-0">
          <BrainCircuit size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-ink">{bank.name}</h2>
            <Badge color="var(--ok)">● active bank</Badge>
            <span className="chip">Θ = (S{bank.disposition.skepticism}, L{bank.disposition.literalism}, E{bank.disposition.empathy}) · β {bank.bias}</span>
          </div>
          <p className="text-xs text-muted mt-0.5 truncate max-w-2xl">{bank.background}</p>
        </div>
        <div className="flex items-center gap-4 text-center">
          {[
            { l: "facts", v: facts.length, c: "var(--world)" },
            { l: "observ.", v: observations.length, c: "var(--observation)" },
            { l: "opinions", v: opinions.length, c: "var(--opinion)" },
            { l: "links", v: bankLinks.length, c: "var(--experience)" },
          ].map((x) => (
            <div key={x.l}>
              <p className="text-lg font-bold tabular-nums" style={{ color: x.c }}>{x.v}</p>
              <p className="text-[10px] uppercase tracking-wider text-faint">{x.l}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "retain", label: "Retain" },
          { id: "browser", label: "Browser", count: facts.length },
          { id: "graph", label: "Graph" },
          { id: "entities", label: "Entities", count: entityIndex.length },
          { id: "recall", label: "Recall" },
          { id: "reflect", label: "Reflect" },
          { id: "observations", label: "Observations", count: observations.length },
          { id: "opinions", label: "Opinions", count: opinions.length },
        ]}
      />

      {tab === "retain" && <RetainPanel />}
      {tab === "browser" && (
        <BrowserPanel
          facts={facts}
          onDelete={(id) => s.deleteFact(id)}
          onRecall={(text) => { setRecallSeed(text); setTab("recall"); }}
        />
      )}
      {tab === "graph" && (
        <Card>
          <MemoryGraph facts={facts} links={bankLinks} height={500} />
        </Card>
      )}
      {tab === "recall" && <RecallPanel facts={facts} links={bankLinks} observations={observations} seedQuery={recallSeed} />}
      {tab === "reflect" && <ReflectPanel facts={facts} links={bankLinks} observations={observations} opinions={opinions} />}
      {tab === "observations" && <ObservationsPanel />}
      {tab === "opinions" && <OpinionsPanel />}
      {tab === "entities" && <EntityStorePanel facts={facts} />}
    </div>
  );
}

/* ================= Retain ================= */

function RetainPanel() {
  const s = useSandbox();
  const [text, setText] = useState("");
  const [tags, setTags] = useState("user:alice");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ factCount: number; steeredOut: number } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scopes, setScopes] = useState({ userId: "alice", agentId: "atlas", appId: "sandbox-demo", runId: "" });
  const [includes, setIncludes] = useState("");
  const [excludes, setExcludes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [infer, setInfer] = useState(true);
  // visual memory state
  const [img, setImg] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [caption, setCaption] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);

  /** simulated vision pass — descriptive elements from caption + filename tokens */
  const visionPass = (cap: string, fileName: string): string[] => {
    const raw = `${cap} ${fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")}`;
    const toks = raw
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3 && !["image", "img", "photo", "screenshot", "png", "jpeg", "jpg", "webp"].includes(t));
    return [...new Set(toks)].slice(0, 6);
  };

  const onPickImage = (file: File) => {
    // downscale to a ≤256px JPEG thumbnail so localStorage stays small
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 256 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      setImg({ dataUrl, fileName: file.name });
      if (!caption) setCaption(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  const doRetain = (content: string) => {
    if (!content.trim() && !img) return;
    setBusy(true);
    setResult(null);
    setTimeout(() => {
      let finalContent = content;
      let attachment: import("@/lib/types").MemoryAttachment | undefined;
      if (img) {
        const elements = visionPass(caption, img.fileName);
        finalContent = [
          content.trim(),
          `User shared an image "${img.fileName}". Caption: ${caption || "(none)"}. Vision pass detected elements: ${elements.join(", ") || "unspecified"}.`,
        ]
          .filter(Boolean)
          .join("\n");
        attachment = { kind: "image", dataUrl: img.dataUrl, caption: caption || img.fileName, fileName: img.fileName, detectedElements: elements };
      }
      const r = s.retain(finalContent, {
        tags: tags.split(/[,\s]+/).filter(Boolean),
        scopes: {
          userId: scopes.userId.trim() || undefined,
          agentId: scopes.agentId.trim() || undefined,
          appId: scopes.appId.trim() || undefined,
          runId: scopes.runId.trim() || undefined,
        },
        includes: includes.trim() || undefined,
        excludes: excludes.trim() || undefined,
        customInstructions: instructions.trim() || undefined,
        infer,
        attachment,
      });
      setResult(r);
      setBusy(false);
      setImg(null);
      setCaption("");
    }, 420);
  };

  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
      <Card>
        <CardHeader
          title="Retain(B, D) → M′"
          subtitle="Paste a transcript or document. The pipeline extracts narrative facts with speaker attribution, resolves entities, builds graph links, auto-categorizes, and (optionally) consolidates."
          icon={<Database size={15} />}
        />
        <Textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"User: We shipped the vector search upgrade yesterday…\nAssistant: Great — I'll note the improvement…"}
          className="font-mono text-[12.5px] leading-relaxed"
        />

        {/* visual memory attachment */}
        <div className="mt-2.5 rounded-xl border border-border-soft bg-bg-soft p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickImage(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => imgInputRef.current?.click()}>
              <ImagePlus size={13} /> {img ? "Replace image" : "Attach image"}
            </Button>
            {img && (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt="attachment preview" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption — what's in the image?" className="h-8 text-[11.5px] flex-1" />
                <Button size="sm" variant="ghost" className="text-faint hover:text-danger shrink-0" onClick={() => { setImg(null); setCaption(""); }}>
                  <X size={13} />
                </Button>
              </div>
            )}
            {!img && (
              <span className="text-[10.5px] text-faint">
                Visual memory: the image is thumbnailed in-browser, a simulated vision pass extracts elements from the
                caption/filename, and the memory becomes cross-modally retrievable.
              </span>
            )}
          </div>
          {img && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[9.5px] uppercase tracking-wider text-faint self-center mr-1">vision pass →</span>
              {visionPass(caption, img.fileName).map((el) => (
                <span key={el} className="chip" style={{ color: "var(--accent-2)" }}>{el}</span>
              ))}
            </div>
          )}
        </div>

        {/* entity scopes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {([
            ["userId", "user_id", "whose persona"],
            ["agentId", "agent_id", "which agent"],
            ["appId", "app_id", "tenant / app"],
            ["runId", "run_id", "session / ticket"],
          ] as const).map(([key, label, ph]) => (
            <div key={key}>
              <p className="text-[9.5px] uppercase tracking-wider text-faint font-mono mb-1">{label}</p>
              <Input
                value={scopes[key]}
                onChange={(e) => setScopes((sc) => ({ ...sc, [key]: e.target.value }))}
                placeholder={ph}
                className="h-8 text-[11px] font-mono"
              />
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-faint mt-1.5 leading-relaxed">
          Extraction attributes each fact to its speaker: <code className="chip">User:</code> lines store with user_id,{" "}
          <code className="chip">Assistant:</code> lines with agent_id — never both. app_id/run_id ride on every record.
        </p>

        <button onClick={() => setShowAdvanced((v) => !v)} className="text-[11px] text-accent hover:underline mt-2.5 flex items-center gap-1">
          {showAdvanced ? "▾" : "▸"} Extraction steering (includes / excludes / instructions / verbatim)
        </button>
        {showAdvanced && (
          <div className="mt-2.5 space-y-2.5 rounded-xl border border-border-soft bg-bg-soft p-3 anim-fade-up">
            <div className="grid md:grid-cols-2 gap-2.5">
              <div>
                <p className="text-[9.5px] uppercase tracking-wider text-faint mb-1">includes — only extract matching</p>
                <Input value={includes} onChange={(e) => setIncludes(e.target.value)} placeholder='"only record food and diet preferences"' className="h-8 text-[11px]" />
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-wider text-faint mb-1">excludes — skip matching</p>
                <Input value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder='"ignore vehicle and parking details"' className="h-8 text-[11px]" />
              </div>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-faint mb-1">custom_instructions — steer the extractor</p>
              <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Keep facts about infrastructure decisions; drop small talk." className="h-8 text-[11px]" />
            </div>
            <Toggle
              checked={!infer}
              onChange={(v) => setInfer(!v)}
              label="infer = false (verbatim storage)"
              description="Skip extraction entirely — store the raw content as one memory with BOTH user_id and agent_id set."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags (comma separated)"
            className="w-52 font-mono text-xs"
          />
          <Button variant="primary" onClick={() => doRetain(text)} disabled={busy || (!text.trim() && !img)}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            {busy ? "Extracting facts…" : img ? "Retain (text + image)" : "Retain"}
          </Button>
          {result && (
            <span className="text-xs text-ok font-medium anim-fade-up">
              ✓ {result.factCount} facts extracted{result.steeredOut > 0 && <span className="text-warn"> · {result.steeredOut} steered out</span>}
            </span>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Sample transcripts" subtitle="one click to retain a demo exchange" icon={<Sparkles size={15} />} />
        <div className="space-y-2">
          {SAMPLE_RETAIN_TEXTS.map((sm) => (
            <button
              key={sm.label}
              onClick={() => {
                setText(sm.text);
                doRetain(sm.text);
              }}
              className="w-full text-left rounded-xl border border-border-soft bg-surface-2 p-3 hover:border-accent-border transition-colors group"
            >
              <p className="text-[13px] font-medium text-ink group-hover:text-accent transition-colors">{sm.label}</p>
              <p className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">{sm.text}</p>
            </button>
          ))}
          <button
            onClick={() => {
              const steering =
                "User: I am vegetarian and I never eat mushrooms. I drive a blue Toyota Corolla and my parking spot is B12.";
              setText(steering);
              setIncludes("only record food and diet preferences");
              setShowAdvanced(true);
            }}
            className="w-full text-left rounded-xl border border-accent-border/50 bg-accent-soft p-3 hover:border-accent-border transition-colors group"
          >
            <p className="text-[13px] font-medium text-accent">Steering demo: includes filter</p>
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Vegetarian + car + parking in one message — with includes=&quot;food and diet&quot;, only the dietary fact survives extraction.
            </p>
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-border-soft bg-bg-soft p-3 text-[11px] text-faint leading-relaxed">
          Extraction is simulated in-browser with deterministic rules (no LLM calls): narrative chunking, speaker
          attribution, entity recognition, temporal normalization, causal cues and catalog-based auto-categorization.
        </div>
      </Card>
    </div>
  );
}

/* ================= Browser ================= */

function BrowserPanel({ facts, onDelete, onRecall }: { facts: MemoryFact[]; onDelete: (id: string) => void; onRecall: (text: string) => void }) {
  const s = useSandbox();
  const [netFilter, setNetFilter] = useState<Network | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<GraphSelection | null>(null);
  const [filters, setFilters] = useState<FilterNode | null>(null);
  const [categoryFacet, setCategoryFacet] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryFact | null>(null);

  const categories = useMemo(() => [...new Set(facts.flatMap((f) => f.categories ?? []))].sort(), [facts]);

  const filtered = facts
    .filter((f) => netFilter === "all" || f.network === netFilter)
    .filter((f) => !categoryFacet || (f.categories ?? []).includes(categoryFacet))
    .filter((f) => matchesFilters(f, filters))
    .filter((f) => !q || f.text.toLowerCase().includes(q.toLowerCase()) || f.entities.some((e) => e.toLowerCase().includes(q.toLowerCase())));

  const sel = selected?.kind === "fact" ? facts.find((f) => f.id === selected.id) : undefined;
  const filterValidation = filters ? validateFilters(filters) : { ok: true, errors: [] };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      <div className="space-y-3 min-w-0">
        <FilterBuilder filters={filters} onChange={setFilters} />
        {!filterValidation.ok && (
          <div className="rounded-lg border border-danger/40 bg-danger/8 px-3 py-2" style={{ background: "color-mix(in srgb, var(--danger) 7%, transparent)" }}>
            {filterValidation.errors.slice(0, 2).map((e, i) => (
              <p key={i} className="text-[10.5px] text-danger font-mono">✗ {e}</p>
            ))}
          </div>
        )}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Segmented
              size="sm"
              value={netFilter}
              onChange={(v) => setNetFilter(v as Network | "all")}
              options={[
                { value: "all", label: "All" },
                ...(Object.keys(NETWORK_META).filter((n) => n !== "observation" && n !== "opinion") as ("world" | "experience")[]).map((n) => ({
                  value: n,
                  label: <span style={{ color: netFilter === n ? NETWORK_META[n].color : undefined }}>{NETWORK_META[n].label}</span>,
                })),
              ]}
            />
            <div className="relative flex-1 min-w-40">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by text or entity…" className="pl-8 h-8 text-xs" />
            </div>
            <span className="text-[11px] text-faint font-mono">{filtered.length} memories</span>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFacet(categoryFacet === c ? null : c)}
                  className={cn("chip cursor-pointer transition-all", categoryFacet === c && "border-accent-border text-accent bg-accent-soft")}
                >
                  #{c}
                </button>
              ))}
              {categoryFacet && (
                <button className="chip cursor-pointer text-faint" onClick={() => setCategoryFacet(null)}>
                  clear facet
                </button>
              )}
            </div>
          )}
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {filtered.map((f) => (
              <FactRow key={f.id} fact={f} selected={selected?.id === f.id} onClick={() => setSelected({ kind: "fact", id: f.id })} onDelete={() => onDelete(f.id)} />
            ))}
            {!filtered.length && <Empty icon={<Database size={28} />} title="No memories match" hint="Adjust filters, or retain a transcript first." />}
          </div>
        </Card>
      </div>

      <Card className="h-fit sticky top-20">
        <CardHeader title="Inspector" icon={<ShieldCheck size={15} />} />
        {sel ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge color={NETWORK_META[sel.network].color}>{NETWORK_META[sel.network].label}</Badge>
              {sel.verbatim && <Badge color="var(--accent-2)">verbatim · infer=false</Badge>}
              {sel.immutable && <Badge color="var(--warn)">immutable</Badge>}
              {sel.expiresAt && (
                <Badge color={new Date(sel.expiresAt) < new Date() ? "var(--danger)" : "var(--muted)"}>
                  <CalendarClock size={9} /> expires {formatDate(sel.expiresAt)}
                </Badge>
              )}
              {sel.supersedes && <Badge color="var(--warn)">↻ supersedes {sel.supersedes.slice(0, 12)}…</Badge>}
              <span className="text-faint font-mono text-[10px]">{sel.id}</span>
            </div>
            <p className="text-ink leading-relaxed">{sel.text}</p>

            {/* entity scopes */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Scopes</p>
              <div className="flex flex-wrap gap-1">
                {([
                  ["user", sel.scopes?.userId],
                  ["agent", sel.scopes?.agentId],
                  ["app", sel.scopes?.appId],
                  ["run", sel.scopes?.runId],
                ] as const).map(([k, v]) =>
                  v ? (
                    <span key={k} className="chip" style={{ color: "var(--accent-2)" }}>
                      {k}: {v}
                    </span>
                  ) : (
                    <span key={k} className="chip opacity-40">{k}: null</span>
                  )
                )}
              </div>
            </div>

            {(sel.categories ?? []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Categories (auto)</p>
                <div className="flex flex-wrap gap-1">
                  {sel.categories.map((c) => (
                    <span key={c} className="chip" style={{ color: "var(--observation)" }}>#{c}</span>
                  ))}
                </div>
              </div>
            )}

            {sel.attachment && (
          <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5">
            <div className="flex items-start gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sel.attachment.dataUrl} alt={sel.attachment.caption} className="w-20 h-20 rounded-lg object-cover border border-border shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-faint mb-0.5">Visual memory</p>
                <p className="text-[11.5px] text-ink leading-snug">{sel.attachment.caption}</p>
                <p className="text-[10px] text-faint font-mono mt-0.5">{sel.attachment.fileName}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {sel.attachment.detectedElements.map((el) => (
                    <span key={el} className="chip" style={{ color: "var(--accent-2)" }}>{el}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
              <Meta k="Occurred" v={`${formatDate(sel.occurredStart)} → ${formatDate(sel.occurredEnd)}`} />
              <Meta k="Mentioned" v={timeAgo(sel.mentionedAt)} />
              <Meta k="Tokens" v={String(sel.tokens)} />
              <Meta k="Access count" v={String(sel.accessCount)} />
              {sel.confidence !== undefined && <Meta k="Confidence" v={sel.confidence.toFixed(2)} />}
            </div>
            {sel.entities.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Entities</p>
                <div className="flex flex-wrap gap-1">
                  {sel.entities.map((e) => (
                    <span key={e} className="chip" style={{ color: "var(--experience)" }}>{e}</span>
                  ))}
                </div>
              </div>
            )}

            {/* revision history */}
            {sel.history.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Revisions ({sel.history.length})</p>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {[...sel.history].reverse().map((h, i) => (
                    <div key={i} className="rounded-md border border-border-soft bg-surface-2 px-2 py-1.5">
                      <p className="text-[10px] text-faint font-mono">{formatDate(h.at)} · {h.note}</p>
                      <p className="text-[10.5px] text-muted line-through decoration-border mt-0.5 leading-snug">{h.text.slice(0, 90)}…</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => onRecall(sel.text.slice(0, 80))}>
                <Search size={12} /> Recall this
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(sel)}>
                <Sparkles size={12} /> Update
              </Button>
              <Button size="sm" variant="ghost" onClick={() => s.toggleImmutable(sel.id)} title={sel.immutable ? "Make editable" : "Mark immutable (must delete + re-add to change)"}>
                {sel.immutable ? "🔓" : "🔒"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => { onDelete(sel.id); setSelected(null); }}>
                <Trash2 size={12} /> Delete
              </Button>
            </div>
            <p className="text-[10.5px] text-faint leading-relaxed">
              Deleting a memory also removes observations derived from it and resets the consolidation state of the
              remaining sources. Use scoped delete (run_id) from the event log for session cleanup.
            </p>
          </div>
        ) : (
          <Empty icon={<Search size={24} />} title="Select a memory" hint="Click any row to inspect scopes, categories, temporal metadata and revisions." />
        )}
      </Card>

      {editing && <UpdateDialog fact={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ================= Update dialog ================= */

function UpdateDialog({ fact, onClose }: { fact: MemoryFact; onClose: () => void }) {
  const s = useSandbox();
  const [text, setText] = useState(fact.text);
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState(fact.expiresAt ? fact.expiresAt.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const r = s.updateFact(fact.id, { text, note: note || "manual update" });
    if (!r.ok) {
      setError(r.error ?? "Update failed");
      return;
    }
    const iso = expires ? new Date(expires + "T23:59:59").toISOString() : null;
    if (iso !== (fact.expiresAt ?? null)) s.setFactExpiration(fact.id, iso);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/55 backdrop-blur-sm px-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5 anim-fade-up" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink mb-1">update(memory_id, text)</h3>
        <p className="text-[11px] text-faint mb-3 font-mono">{fact.id} · revision #{fact.history.length + 1}</p>
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="text-[12.5px] leading-relaxed" autoFocus />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Change note (audit trail)…" className="text-xs" />
          <div>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="text-xs" title="expiration_date — past this, recall skips the memory unless include-expired is on" />
          </div>
        </div>
        <p className="text-[10px] text-faint mt-1 flex items-center gap-1">
          <CalendarClock size={10} /> expiration_date (TTL) — leave empty for no expiry
        </p>
        {error && <p className="text-[11px] text-danger mt-2 font-mono">✗ {error}</p>}
        <p className="text-[10.5px] text-faint mt-2 leading-relaxed">
          Saving recomputes tokens and entities, re-runs auto-categorization against the bank catalog, and preserves
          the previous text in the revision history — nothing is silently overwritten.
        </p>
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={save} disabled={!text.trim() || (text === fact.text && expires === (fact.expiresAt ? fact.expiresAt.slice(0, 10) : ""))}>
            Save revision
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface-2 px-2.5 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wider text-faint">{k}</p>
      <p className="text-ink font-mono text-[11px] mt-0.5">{v}</p>
    </div>
  );
}

function FactRow({ fact, selected, onClick, onDelete }: { fact: MemoryFact; selected: boolean; onClick: () => void; onDelete: () => void }) {
  const s = useSandbox();
  const expired = fact.expiresAt ? new Date(fact.expiresAt) < new Date() : false;
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 cursor-pointer transition-all group",
        selected ? "border-accent-border bg-accent-soft" : "border-border-soft bg-surface-2 hover:border-border",
        expired && "opacity-55"
      )}
    >
      <div className="flex items-start gap-2">
        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: NETWORK_META[fact.network].color }} />
        {fact.attachment && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={fact.attachment.dataUrl} alt={fact.attachment.caption} className="w-9 h-9 rounded-md object-cover border border-border shrink-0" title={`Image: ${fact.attachment.caption}`} />
        )}
        <p className="text-[12.5px] text-ink leading-relaxed flex-1">{fact.text}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); s.feedbackFact(fact.id, true); }}
            className="text-faint hover:text-ok transition-colors p-0.5"
            title="Helpful — raise access weight"
          >
            <ThumbsUp size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); s.feedbackFact(fact.id, false); }}
            className="text-faint hover:text-danger transition-colors p-0.5"
            title="Wrong/stale — flag for review, weaken related opinions"
          >
            <ThumbsDown size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-faint hover:text-danger transition-colors p-0.5"
            title="Delete memory (derived observations are invalidated)"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-3.5">
        <Badge color={NETWORK_META[fact.network].color}>{NETWORK_META[fact.network].label}</Badge>
        {(fact.categories ?? []).slice(0, 2).map((c) => (
          <span key={c} className="chip" style={{ color: "var(--observation)" }}>#{c}</span>
        ))}
        {fact.entities.slice(0, 2).map((e) => <span key={e} className="chip">{e}</span>)}
        {fact.scopes?.userId && <span className="chip" style={{ color: "var(--accent-2)" }}>u:{fact.scopes.userId}</span>}
        {fact.scopes?.runId && <span className="chip" style={{ color: "var(--accent-2)" }}>r:{fact.scopes.runId}</span>}
        {fact.supersedes && (
          <span className="chip" style={{ color: "var(--warn)" }} title={`Supersedes ${fact.supersedes}`}>↻ supersedes</span>
        )}
        {expired && <span className="chip" style={{ color: "var(--danger)" }}>expired</span>}
        {fact.immutable && <span className="chip" style={{ color: "var(--warn)" }}>🔒</span>}
        {fact.history.length > 0 && <span className="chip" title="revisions">rev ×{fact.history.length}</span>}
        {(fact.feedback?.up || fact.feedback?.down) ? (
          <span className="chip" title="feedback">
            👍{fact.feedback?.up ?? 0}{fact.feedback?.down ? ` 👎${fact.feedback.down}` : ""}
          </span>
        ) : null}
        {fact.metadata?.needs_review === "1" && <span className="chip" style={{ color: "var(--danger)" }}>needs review</span>}
        <span className="text-[10px] text-faint font-mono ml-auto">{formatDate(fact.occurredStart)} · {fact.tokens} tok</span>
      </div>
    </div>
  );
}

/* ================= Recall ================= */

function RecallPanel({
  facts,
  links,
  observations,
  seedQuery,
}: {
  facts: MemoryFact[];
  links: import("@/lib/types").GraphLink[];
  observations: import("@/lib/types").Observation[];
  seedQuery?: string | null;
}) {
  const s = useSandbox();
  const [query, setQuery] = useState(seedQuery ?? "What does Alice prefer for frontend work?");
  const [trace, setTrace] = useState<RecallTrace | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<FilterNode | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (seedQuery) setQuery(seedQuery);
  }, [seedQuery]);

  const run = () => {
    if (!query.trim()) return;
    setBusy(true);
    setTimeout(() => {
      const t = recall({
        query,
        facts,
        links,
        observations,
        opinions: s.opinions.filter((o) => o.bankId === s.activeBankId),
        settings: s.recallSettings,
        filters,
      });
      setTrace(t);
      setBusy(false);
      s.bumpAccess(t.selected.map((c) => c.fact.id));
      s.logEvent({
        app: "memory",
        op: "recall",
        message: `recall(query="${query.slice(0, 48)}${query.length > 48 ? "…" : ""}"${filters ? ", filters=on" : ""}) → ${t.selected.length} memories, ${t.tokensUsed} tokens`,
        latencyMs: Math.round(t.latencyMs),
        tokens: t.tokensUsed,
      });
      s.recordRun({ memory: 1 });
    }, 320);
  };

  const presets = [
    "What does Alice prefer for frontend work?",
    "Where does Alice work?",
    "What happened with the Redis license?",
    "What did the team do last spring?",
    "Why did the outage happen?",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Recall(B, Q, k) → {f₁…fₙ}"
          subtitle="Token-budgeted multi-strategy retrieval with optional v2 filters applied before the arms run."
          icon={<Search size={15} />}
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters((v) => !v)} className={cn("chip cursor-pointer transition-all", (filters || showFilters) && "border-accent-border text-accent")}>
                filters {filters ? "●" : ""}
              </button>
              <span className="text-[10.5px] font-mono text-faint hidden md:inline">
                budget={s.recallSettings.budget} · max_tokens={s.recallSettings.maxTokens} · rerank={s.recallSettings.rerankEnabled ? "on" : "off"}
              </span>
            </div>
          }
        />
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Ask the bank anything — try a temporal question like “What happened in March?”"
            className="flex-1"
          />
          <Button variant="primary" onClick={run} disabled={busy}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Run recall
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {presets.map((p) => (
            <button key={p} onClick={() => setQuery(p)} className="chip hover:border-accent-border hover:text-accent transition-colors cursor-pointer">
              {p}
            </button>
          ))}
        </div>
        {showFilters && (
          <div className="mt-3 anim-fade-up">
            <FilterBuilder filters={filters} onChange={setFilters} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-faint self-center mr-1">quick:</span>
              {[
                { l: "user:alice", f: { user_id: "alice" } },
                { l: "agent memories", f: { agent_id: "*" } },
                { l: "run:session-mar", f: { run_id: "session-mar" } },
                { l: "#tooling", f: { categories: { in: ["tooling"] } } },
                { l: "NOT opinion", f: { NOT: { network: "opinion" } } },
              ].map((p) => (
                <button key={p.l} className="chip cursor-pointer hover:border-accent-border hover:text-accent" onClick={() => setFilters(p.f as FilterNode)}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
      {trace && <RecallTraceView trace={trace} />}
      {!trace && (
        <Card>
          <Empty
            icon={<GitBranch size={30} />}
            title="Run a recall to see the full pipeline trace"
            hint="Filters → four arms → RRF fusion → cross-encoder (or quick path) → boosts → token packing, with per-candidate scoring."
          />
        </Card>
      )}
    </div>
  );
}

/* ================= Reflect ================= */

function ReflectPanel({
  facts,
  links,
  observations,
  opinions,
}: {
  facts: MemoryFact[];
  links: import("@/lib/types").GraphLink[];
  observations: import("@/lib/types").Observation[];
  opinions: import("@/lib/types").Opinion[];
}) {
  const s = useSandbox();
  const bank = s.banks.find((b) => b.id === s.activeBankId)!;
  const [query, setQuery] = useState("Should we use Redis or Valkey for the new caching layer?");
  const [result, setResult] = useState<ReflectResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [keepOpinions, setKeepOpinions] = useState(true);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const r = reflect({ query, facts, links, observations, opinions, settings: s.recallSettings, bank });
      if (keepOpinions) {
        for (const o of r.newOpinions) {
          s.addOpinion({ ...o, entities: [] });
        }
      }
      setResult(r);
      setBusy(false);
      s.logEvent({
        app: "memory",
        op: "reflect",
        message: `reflect(query="${query.slice(0, 44)}…") → grounded answer${r.newOpinions.length ? `, ${r.newOpinions.length} opinion(s) formed` : ""}`,
        latencyMs: Math.round(r.trace.latencyMs + 640),
        tokens: r.trace.tokensUsed,
      });
      s.recordRun({ memory: 1 });
    }, 500);
  };

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Reflect(B, Q, Θ) → (r, O′)" subtitle="Preference-conditioned reasoning over recalled memories" icon={<Sparkles size={15} />} />
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="Ask a subjective question to see opinions form…" />
            <Button variant="primary" onClick={run} disabled={busy}>
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Reflect
            </Button>
          </div>
          <div className="mt-3">
            <Toggle checked={keepOpinions} onChange={setKeepOpinions} label="Persist newly formed opinions" description="Store opinions in network O with confidence scores (they can be reinforced later)." />
          </div>
        </Card>

        {result && (
          <Card className="anim-fade-up">
            <CardHeader title="Response" icon={<MessageSquareQuote size={15} />} right={<Badge color="var(--ok)">grounded · cited</Badge>} />
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{result.response}</p>
            {result.newOpinions.length > 0 && (
              <div className="mt-3 rounded-xl border border-opinion/30 bg-opinion/8 p-3" style={{ background: "color-mix(in srgb, var(--opinion) 7%, transparent)" }}>
                <p className="text-[11px] font-semibold text-opinion uppercase tracking-wider mb-1.5">Opinion formed</p>
                {result.newOpinions.map((o, i) => (
                  <div key={i} className="text-xs text-ink leading-relaxed">
                    “{o.text}” <span className="font-mono text-opinion">(c = {o.confidence.toFixed(2)})</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-faint mb-1.5">Memories used ({result.memories.length})</p>
              <div className="space-y-1">
                {result.memories.slice(0, 5).map((m, i) => (
                  <div key={m.fact.id} className="flex items-start gap-2 text-[11.5px] rounded-lg bg-surface-2 border border-border-soft px-2.5 py-1.5">
                    <span className="font-mono text-faint shrink-0">[{i + 1}]</span>
                    <Badge color={NETWORK_META[m.fact.network].color} className="shrink-0">{NETWORK_META[m.fact.network].label}</Badge>
                    <span className="text-muted leading-snug">{m.fact.text.slice(0, 110)}{m.fact.text.length > 110 ? "…" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="System prompt s = Verbalize(n, h, Θ)" subtitle="what the backbone model would receive" icon={<ShieldCheck size={15} />} />
          <pre className="text-[11px] font-mono text-muted leading-relaxed whitespace-pre-wrap rounded-lg bg-bg-soft border border-border-soft p-3 max-h-72 overflow-y-auto">
            {result?.systemPrompt ?? "// run a reflect to compose the system prompt"}
          </pre>
        </Card>
        <Card>
          <CardHeader title="Disposition Θ" subtitle="edit in Prompt Studio — sliders there write to this bank" icon={<BrainCircuit size={15} />} />
          {(["skepticism", "literalism", "empathy"] as const).map((k) => (
            <div key={k} className="mb-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted capitalize">{k}</span>
                <span className="font-mono text-accent">{bank.disposition[k]}</span>
              </div>
              <Progress value={bank.disposition[k]} max={5} />
            </div>
          ))}
          <div className="flex justify-between text-[11px]">
            <span className="text-muted">Bias strength β</span>
            <span className="font-mono text-accent">{bank.bias.toFixed(2)}</span>
          </div>
          <Progress value={bank.bias * 100} color="var(--opinion)" />
        </Card>
      </div>
    </div>
  );
}

/* ================= Observations ================= */

const TREND_META = {
  new: { icon: Plus, color: "var(--world)", label: "new" },
  strengthening: { icon: TrendingUp, color: "var(--ok)", label: "strengthening" },
  stable: { icon: Minus, color: "var(--muted)", label: "stable" },
  weakening: { icon: TrendingDown, color: "var(--warn)", label: "weakening" },
  stale: { icon: RefreshCw, color: "var(--danger)", label: "stale — verify against raw facts" },
} as const;

function ObservationsPanel() {
  const s = useSandbox();
  const observations = s.observations.filter((o) => o.bankId === s.activeBankId);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Layers size={15} className="text-observation" /> Consolidated knowledge
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Deduplicated beliefs grounded in evidence — refined, never overwritten. Auto-consolidation is{" "}
            <span className={s.recallSettings.autoConsolidation ? "text-ok" : "text-warn"}>
              {s.recallSettings.autoConsolidation ? "ON (runs after retain)" : "OFF"}
            </span>{" "}
            · dedup threshold <span className="font-mono text-accent">{s.recallSettings.dedupThreshold}</span>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            const r = s.runConsolidation();
            void r;
          }}
        >
          <RefreshCw size={13} /> Consolidate now
        </Button>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {observations.map((o) => {
          const trend = TREND_META[o.trend];
          const open = expanded === o.id;
          return (
            <Card key={o.id} className={cn("transition-all cursor-pointer hover:border-accent-border", open && "glow-ring md:col-span-2")} onClick={() => setExpanded(open ? null : o.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-semibold text-ink leading-snug">{o.title}</h4>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge color={trend.color}>
                      <trend.icon size={9} /> {trend.label.split(" ")[0]}
                    </Badge>
                    <span className="chip">proofs ×{o.proofCount}</span>
                    {o.scope.length > 0 && o.scope.map((sc) => <span key={sc} className="chip">{sc}</span>)}
                    <span className="text-[10px] text-faint font-mono ml-auto">updated {timeAgo(o.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <p className="text-[12.5px] text-muted leading-relaxed mt-2">{o.content}</p>
              {open && (
                <div className="mt-3 space-y-3 anim-fade-up">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-faint mb-1.5">Supporting evidence ({o.evidence.length})</p>
                    <div className="space-y-1.5">
                      {o.evidence.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2 text-[11.5px]">
                          <MessageSquareQuote size={12} className="text-observation shrink-0 mt-0.5" />
                          <span className="text-muted italic leading-snug">“{e.quote}”</span>
                          <span className="text-faint font-mono text-[10px] ml-auto shrink-0">{formatDate(e.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {o.history.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-faint mb-1.5">Evolution history</p>
                      <div className="space-y-1">
                        {o.history.map((h, i) => (
                          <div key={i} className="text-[11px] text-faint flex gap-2">
                            <span className="font-mono shrink-0">{formatDate(h.at)}</span>
                            <span className="line-through decoration-border">{h.content.slice(0, 90)}…</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {!observations.length && (
          <Card className="md:col-span-2">
            <Empty icon={<Layers size={28} />} title="No observations yet" hint="Retain facts, then consolidation will synthesize entity-level beliefs here." />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ================= Opinions ================= */

function OpinionsPanel() {
  const s = useSandbox();
  const opinions = s.opinions.filter((o) => o.bankId === s.activeBankId);

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {opinions.map((o) => (
        <Card key={o.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] text-ink leading-relaxed flex-1">“{o.text}”</p>
            <Badge color="var(--opinion)">c = {o.confidence.toFixed(2)}</Badge>
          </div>
          <div className="mt-2.5">
            <Progress value={o.confidence * 100} color="var(--opinion)" />
          </div>
          {/* confidence trajectory */}
          {o.history.length > 1 && (
            <svg viewBox="0 0 200 34" className="w-full h-9 mt-2">
              <polyline
                points={o.history.map((h, i) => `${(i / (o.history.length - 1)) * 196 + 2},${30 - h.confidence * 26}`).join(" ")}
                fill="none"
                stroke="var(--opinion)"
                strokeWidth="1.6"
              />
              {o.history.map((h, i) => (
                <circle key={i} cx={(i / (o.history.length - 1)) * 196 + 2} cy={30 - h.confidence * 26} r="2.4" fill="var(--opinion)">
                  <title>{`${h.event}: c=${h.confidence.toFixed(2)}${h.note ? ` — ${h.note}` : ""}`}</title>
                </circle>
              ))}
            </svg>
          )}
          <p className="text-[11px] text-faint leading-relaxed mt-1">{o.reasoning}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {o.entities.map((e) => <span key={e} className="chip">{e}</span>)}
            <span className="text-[10px] text-faint font-mono ml-auto">formed {timeAgo(o.formedAt)}</span>
          </div>
          <div className="flex gap-1.5 mt-3">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => s.reinforce(o.id, "reinforce", "Manual supporting evidence")}>
              <TrendingUp size={12} className="text-ok" /> Reinforce +α
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => s.reinforce(o.id, "weaken", "Manual weakening evidence")}>
              <TrendingDown size={12} className="text-warn" /> Weaken −α
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => s.reinforce(o.id, "contradict", "Contradicting evidence retained")}>
              <Minus size={12} className="text-danger" /> Contradict −2α
            </Button>
          </div>
          {o.history.length > 0 && (
            <div className="mt-3 border-t border-border-soft pt-2 space-y-1 max-h-24 overflow-y-auto">
              {[...o.history].reverse().slice(0, 4).map((h, i) => (
                <p key={i} className="text-[10.5px] text-faint font-mono">
                  {formatDate(h.at)} · {h.event} → c={h.confidence.toFixed(2)}{h.note ? ` · ${h.note.slice(0, 50)}` : ""}
                </p>
              ))}
            </div>
          )}
        </Card>
      ))}
      {!opinions.length && (
        <Card className="md:col-span-2">
          <Empty icon={<BrainCircuit size={28} />} title="No opinions yet" hint="Run a reflect on a subjective question — opinions form with confidence scores." />
        </Card>
      )}
    </div>
  );
}

/* ================= Entity store ================= */

function EntityStorePanel({ facts }: { facts: MemoryFact[] }) {
  const index = useMemo(() => buildEntityIndex(facts), [facts]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(index[0]?.name ?? null);

  const filtered = index.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  const sel = index.find((e) => e.name === selected) ?? null;
  const selFacts = sel ? facts.filter((f) => sel.factIds.includes(f.id)) : [];
  const maxDeg = Math.max(1, ...index.map((e) => e.degree));

  if (!index.length)
    return (
      <Card>
        <Empty icon={<NetworkIcon size={28} />} title="No entities yet" hint="Retain transcripts — entities are extracted and canonicalized into this store automatically." />
      </Card>
    );

  return (
    <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3 px-1">
          <NetworkIcon size={14} className="text-accent" />
          <p className="text-[10px] uppercase tracking-widest text-faint font-semibold flex-1">Canonical entities · {index.length}</p>
          <div className="relative w-40">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find entity…" className="h-7 pl-7 text-[11px]" />
          </div>
        </div>
        <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((e) => (
            <button
              key={e.name}
              onClick={() => setSelected(e.name)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all",
                selected === e.name ? "border-accent-border bg-accent-soft" : "border-transparent hover:bg-surface-2"
              )}
            >
              <span className={cn("text-[12.5px] font-medium truncate w-36", selected === e.name ? "text-accent" : "text-ink")}>{e.name}</span>
              <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <span className="block h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" style={{ width: `${(e.degree / maxDeg) * 100}%` }} />
              </span>
              <span className="text-[10.5px] font-mono text-faint w-14 text-right">deg {e.degree}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4 min-w-0">
        {sel && (
          <Card className="anim-fade-up">
            <CardHeader
              title={sel.name}
              subtitle={`linked to ${sel.degree} memories · first seen ${formatDate(sel.firstSeen)} · last seen ${formatDate(sel.lastSeen)}`}
              icon={<NetworkIcon size={15} />}
              right={
                <div className="text-right">
                  <p className="text-[9.5px] uppercase tracking-wider text-faint">query boost if matched</p>
                  <p className="text-sm font-mono text-accent">×{(1 + 0.15 * (entityBoostSignal(sel.degree) * 2 - 1)).toFixed(3)}</p>
                </div>
              }
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-faint mb-2">Network mix</p>
                <div className="space-y-1.5">
                  {(["world", "experience", "opinion"] as const).map((n) => {
                    const c = sel.networks[n] ?? 0;
                    return (
                      <div key={n} className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NETWORK_META[n].color }} />
                        <span className="text-muted w-20">{NETWORK_META[n].label}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${(c / Math.max(1, sel.degree)) * 100}%`, background: NETWORK_META[n].color }} />
                        </span>
                        <span className="font-mono text-ink w-4 text-right">{c}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-faint mt-4 mb-2">Co-occurs with</p>
                <div className="flex flex-wrap gap-1.5">
                  {sel.cooccur.map((c) => (
                    <button key={c.entity} className="chip cursor-pointer hover:border-accent-border hover:text-accent transition-colors" onClick={() => setSelected(c.entity)}>
                      {c.entity} <span className="opacity-60">×{c.count}</span>
                    </button>
                  ))}
                  {!sel.cooccur.length && <span className="text-[11px] text-faint italic">no co-occurrences</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-faint mb-2">Linked memories ({selFacts.length})</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {selFacts.map((f) => (
                    <div key={f.id} className="rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NETWORK_META[f.network].color }} />
                        <span className="text-[10px] text-faint font-mono">{formatDate(f.occurredStart)}</span>
                        {f.attachment && <ImagePlus size={10} className="text-accent2" />}
                      </div>
                      <p className="text-[11.5px] text-muted leading-snug mt-1">{f.text.slice(0, 130)}{f.text.length > 130 ? "…" : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10.5px] text-faint mt-3 leading-relaxed border-t border-border-soft pt-2.5">
              Entities are canonicalized mentions (people, places, organizations, products, concepts). Each entity
              links every memory that mentions it — this is what powers graph traversal and the entity-overlap boost
              in recall. The store is schema-free: connections are inferred from co-occurrence, never hand-declared.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
