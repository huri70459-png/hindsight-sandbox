"use client";

/* Integrations — connection surface for the sandbox:
   REST/SDK snippets, Zapier & n8n mappings, a LangGraph support-agent
   pattern, and a working webhook emitter with simulated deliveries. */

import { useMemo, useState } from "react";
import {
  Cable, Check, Copy, Plus, Radio, Trash2, Webhook, Workflow, Zap, ChevronDown, ChevronRight, Code2,
  Terminal, Activity, Download, Plug,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Select, Tabs, Textarea, Toggle } from "@/components/ui";
import { useSandbox } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import type { WebhookEvent } from "@/lib/types";
import { MCP_TOOLS, clientConfigSnippet, executeMcpTool, type McpApi } from "@/lib/engine/mcp";
import {
  downloadBlob, evalRunsToJson, eventsToSpans, metricsSnapshot, observerConfigSnippet,
  spansToCsv, toJsonl,
} from "@/lib/engine/observability";
import { recall as doRecall } from "@/lib/engine/recall";
import { reflect as doReflect } from "@/lib/engine/reflect";
import { buildEntityIndex } from "@/lib/engine/entities";
import { embed, cosine } from "@/lib/engine/nlp";

const WEBHOOK_EVENTS: WebhookEvent[] = [
  "memory.retained",
  "memory.recalled",
  "memory.reflected",
  "observation.changed",
  "eval.completed",
  "pipeline.run",
  "*",
];

type Tab = "rest" | "zapier" | "n8n" | "langgraph" | "mcp" | "webhooks" | "observability";

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("rest");
  const s = useSandbox();
  const hydrated = useSandbox((st) => st.hydrated);
  if (!hydrated) return <Empty title="Restoring sandbox state…" />;

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <Card className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Cable size={15} className="text-accent" /> Integrations
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Connection patterns for wiring the sandbox into external tools — generated against the active bank (
            <span className="font-mono text-accent">{s.banks.find((b) => b.id === s.activeBankId)?.id}</span>).
            Snippets target the documented sandbox HTTP contract; webhook deliveries are simulated in-browser.
          </p>
        </div>
        <Badge color="var(--ok)">{s.webhooks.filter((w) => w.active).length} active subscriptions</Badge>
      </Card>

      <Tabs
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: "rest", label: "REST & SDK" },
          { id: "mcp", label: "MCP Server" },
          { id: "zapier", label: "Zapier" },
          { id: "n8n", label: "n8n" },
          { id: "langgraph", label: "LangGraph" },
          { id: "webhooks", label: "Webhooks", count: s.webhookDeliveries.length },
          { id: "observability", label: "Observability" },
        ]}
      />

      {tab === "rest" && <RestTab />}
      {tab === "mcp" && <McpTab />}
      {tab === "zapier" && <ZapierTab />}
      {tab === "n8n" && <N8nTab />}
      {tab === "langgraph" && <LangGraphTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "observability" && <ObservabilityTab />}
    </div>
  );
}

/* ============ shared code block ============ */

function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border-soft bg-bg-soft overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-soft">
        <Code2 size={12} className="text-faint" />
        <span className="text-[11px] font-mono text-muted">{title ?? lang}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-[10.5px]"
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />} {copied ? "copied" : "copy"}
        </Button>
      </div>
      <pre className="p-3.5 text-[11.5px] leading-relaxed font-mono text-muted overflow-x-auto max-h-96 overflow-y-auto">
        {code}
      </pre>
    </div>
  );
}

/* ============ REST & SDK ============ */

function RestTab() {
  const s = useSandbox();
  const bankId = s.activeBankId;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const curl = `# retain — store a conversation turn
curl -X POST ${origin}/api/v1/banks/${bankId}/retain \\
  -H 'Content-Type: application/json' \\
  -d '{
    "content": "User: We migrated the cache to Valkey last night. Zero incidents so far.",
    "tags": ["team:eng"],
    "scopes": { "user_id": "alice", "app_id": "sandbox-demo", "run_id": "standup-42" },
    "includes": "infrastructure decisions",
    "infer": true
  }'

# recall — token-budgeted multi-strategy retrieval with v2 filters
curl -X POST ${origin}/api/v1/banks/${bankId}/recall \\
  -H 'Content-Type: application/json' \\
  -d '{
    "query": "which cache do we use now?",
    "max_tokens": 4096,
    "budget": "mid",
    "filters": { "AND": [ { "app_id": "sandbox-demo" }, { "categories": { "in": ["tooling"] } } ] }
  }'

# reflect — preference-conditioned answer with opinion formation
curl -X POST ${origin}/api/v1/banks/${bankId}/reflect \\
  -H 'Content-Type: application/json' \\
  -d '{ "query": "Should other services migrate to Valkey too?" }'`;

  const py = `from hindsight_sandbox import SandboxClient   # conceptual SDK

client = SandboxClient(base_url="${origin}")

# 1. retain with scoping + steering
res = client.retain(
    bank_id="${bankId}",
    content="User: I switched my editor to Neovim. The modal editing finally clicked.",
    scopes={"user_id": "alice", "app_id": "sandbox-demo"},
    includes="tool preferences",
)
print(res.fact_count, "facts;", res.steered_out, "steered out")

# 2. recall with filters v2
hits = client.recall(
    bank_id="${bankId}",
    query="what editor does the user prefer?",
    filters={"user_id": "alice", "categories": {"in": ["preferences"]}},
    budget="low",
    max_tokens=2048,
)
for h in hits.selected:
    print(h.final_score, h.fact.text)

# 3. update with audit trail
client.update(memory_id=hits.selected[0].fact.id, text="User prefers Neovim (switched from VS Code in 2026).")`;

  const ts = `import { SandboxClient } from "@hindsight-sandbox/client";

const client = new SandboxClient({ baseUrl: "${origin}" });

await client.retain({
  bankId: "${bankId}",
  content: "Assistant: I flagged the flaky e2e suite for review.",
  scopes: { agentId: "atlas", appId: "sandbox-demo", runId: "ci-991" },
});

const { selected } = await client.recall({
  bankId: "${bankId}",
  query: "any known flaky tests?",
  filters: { agent_id: "atlas" },
  budget: "mid",
  maxTokens: 4096,
});

console.log(selected.map((m) => m.fact.text));`;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader title="HTTP contract" subtitle="three core operations, one bank path — mirrors the retain/recall/reflect loop" icon={<Radio size={15} />} />
          <CodeBlock code={curl} lang="bash" title="curl · retain / recall / reflect" />
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Client SDKs" subtitle="same surface in Python and TypeScript" icon={<Code2 size={15} />} />
          <div className="space-y-3">
            <CodeBlock code={py} lang="python" title="python · sandbox_client.py" />
            <CodeBlock code={ts} lang="typescript" title="typescript · @hindsight-sandbox/client" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============ Zapier ============ */

function ZapierTab() {
  const s = useSandbox();
  const bankId = s.activeBankId;
  const zap = `{
  "zap_step": {
    "app": "hindsight-sandbox",
    "action": "add_memory",
    "fields": {
      "content": "{{trigger.message_text}}",
      "bank_id": "${bankId}",
      "user_id": "{{trigger.customer_email}}",
      "run_id": "zap-{{zapier.meta.unique_id}}",
      "includes": "durable customer facts only",
      "wait_for_completion": true
    }
  }
}`;
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <Card>
        <CardHeader title="Zap pattern — fire-and-forget steps, persistent memory" subtitle="Trigger (form / ticket / chat) → Add Memory → later Zap: Search Memories → reply" icon={<Zap size={15} />} />
        <div className="space-y-2.5 mb-4">
          {[
            ["1", "Connect once with an API key (password field, masked in the editor)."],
            ["2", "Add Memory step stores what a Zap learns — scopes ride on every record."],
            ["3", "Search Memories / Get Memories pull context into later steps."],
            ["4", "Delete Memory removes one record by id (pair with Search to resolve ids)."],
          ].map(([n, t]) => (
            <div key={n} className="flex items-start gap-2.5 text-[12.5px] text-muted leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-accent-soft border border-accent-border/50 text-accent grid place-items-center text-[10px] font-bold shrink-0 mt-0.5">{n}</span>
              {t}
            </div>
          ))}
        </div>
        <CodeBlock code={zap} lang="json" title="zap step payload" />
      </Card>
      <Card className="h-fit">
        <CardHeader title="Action → endpoint map" icon={<Cable size={15} />} />
        <table className="w-full text-[11.5px]">
          <tbody>
            {[
              ["Add Memory", "POST /retain", "var(--world)"],
              ["Search Memories", "POST /recall", "var(--observation)"],
              ["Get Memories", "POST /memories (paged)", "var(--experience)"],
              ["Delete Memory", "DELETE /memories/{id}", "var(--danger)"],
            ].map(([a, e, c]) => (
              <tr key={a} className="border-b border-border-soft/60">
                <td className="py-2 pr-2"><Badge color={c}>{a}</Badge></td>
                <td className="py-2 font-mono text-muted text-right">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rounded-lg border border-border-soft bg-bg-soft p-3 text-[11px] text-faint leading-relaxed mt-4">
          <b className="text-muted">Async caveat:</b> extraction runs in the background, so a Search fired one second
          after an Add may miss it. Either enable <b className="text-muted">Wait for Completion</b> (polls up to 60 s)
          or insert a Delay step. A timed-out Add was still accepted — verify with Get before retrying.
        </div>
      </Card>
    </div>
  );
}

/* ============ n8n ============ */

function N8nTab() {
  const s = useSandbox();
  const bankId = s.activeBankId;
  const flow = `{
  "name": "support-agent-with-memory",
  "nodes": [
    { "name": "Chat Trigger", "type": "n8n-nodes-base.chatTrigger" },
    {
      "name": "Sandbox Memory",
      "type": "community.sandboxMemory",
      "parameters": { "operation": "search", "bankId": "${bankId}", "userId": "={{ $json.email }}" },
      "usableAsTool": true
    },
    { "name": "AI Agent", "type": "@n8n/n8n-nodes-langchain.agent", "tools": ["Sandbox Memory"] },
    {
      "name": "Write Back",
      "type": "community.sandboxMemory",
      "parameters": { "operation": "add", "bankId": "${bankId}", "waitForCompletion": true }
    }
  ],
  "connections": {
    "Chat Trigger": ["AI Agent"],
    "AI Agent": ["Write Back"]
  }
}`;
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <Card>
        <CardHeader title="n8n community-node pattern" subtitle="drop-in node with Add / Search / Get / Get Many / Update / Delete — and usableAsTool for AI Agents" icon={<Workflow size={15} />} />
        <CodeBlock code={flow} lang="json" title="workflow skeleton" />
        <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
          {[
            ["Agent tool loop", "Attach one node set to Search and one to Add — the agent recalls before answering and writes back durable facts after. Keep the same user id on both."],
            ["Entity scope is mandatory", "Add / Search / Get Many require at least one of user_id, agent_id, app_id, run_id — the node fails fast with a clear message if all four are empty."],
            ["Multiple ids = OR", "Supplying several entity ids widens (union) rather than narrows — run one operation per id to intersect."],
            ["Wait for Completion", "On by default for Add; turn it off only if a downstream Wait node covers the async extraction lag."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-border-soft bg-surface-2 p-3">
              <p className="text-[12px] font-semibold text-ink">{t}</p>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Operations" icon={<Cable size={15} />} />
        <div className="space-y-1.5">
          {[
            ["add", "POST /retain"],
            ["search", "POST /recall"],
            ["getMany", "POST /memories"],
            ["get", "GET /memories/{id}"],
            ["update", "PUT /memories/{id}"],
            ["delete", "DELETE /memories/{id}"],
          ].map(([op, ep]) => (
            <div key={op} className="flex items-center justify-between rounded-md bg-surface-2 border border-border-soft px-2.5 py-1.5">
              <span className="font-mono text-[11px] text-accent2">{op}</span>
              <span className="font-mono text-[10.5px] text-faint">{ep}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border-soft bg-bg-soft p-3 text-[11px] text-faint leading-relaxed mt-4">
          Community nodes install on <b className="text-muted">self-hosted n8n only</b> (owner access required). In
          this sandbox the same operations are available directly from the Memory app and the orchestrator's Webhook
          Sink node.
        </div>
      </Card>
    </div>
  );
}

/* ============ LangGraph ============ */

function LangGraphTab() {
  const s = useSandbox();
  const bankId = s.activeBankId;
  const code = `"""Support agent: LangGraph flow + sandbox memory.

search-before-answer, write-after-answer — the memory node is a graph
participant, not middleware hidden inside the model call.
"""
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from hindsight_sandbox import SandboxClient

client = SandboxClient()
BANK = "${bankId}"

class State(TypedDict):
    messages: Annotated[list, add_messages]
    user_id: str

def recall_node(state: State):
    hits = client.recall(
        bank_id=BANK,
        query=state["messages"][-1].content,
        filters={"user_id": state["user_id"]},
        budget="mid",
        max_tokens=2048,
    )
    ctx = "\\n".join(f"- [{h.fact.network}] {h.fact.text}" for h in hits.selected)
    return {"messages": [("system", f"Relevant memories:\\n{ctx}")]}

def chatbot(state: State):
    # your backbone LLM call, conditioned on the recalled context
    answer = call_llm(state["messages"])
    return {"messages": [("assistant", answer)]}

def retain_node(state: State):
    last_user = state["messages"][-2].content
    last_asst = state["messages"][-1].content
    client.retain(
        bank_id=BANK,
        content=f"User: {last_user}\\nAssistant: {last_asst}",
        scopes={"user_id": state["user_id"], "run_id": "support-thread"},
    )
    return {}

g = StateGraph(State)
g.add_node("recall", recall_node)
g.add_node("chatbot", chatbot)
g.add_node("retain", retain_node)
g.add_edge(START, "recall")
g.add_edge("recall", "chatbot")
g.add_edge("chatbot", "retain")
g.add_edge("retain", "recall")   # loop for multi-turn
app = g.compile()`;
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <Card>
        <CardHeader title="LangGraph pattern — memory as explicit graph nodes" subtitle="recall → chatbot → retain, looping for multi-turn conversations" icon={<Workflow size={15} />} />
        <CodeBlock code={code} lang="python" title="support_agent.py" />
      </Card>
      <Card className="h-fit">
        <CardHeader title="Why nodes, not wrappers" icon={<Zap size={15} />} />
        <div className="space-y-2.5 text-[12px] text-muted leading-relaxed">
          <p>
            A drop-in client wrapper hides memory inside the model call. Modeling recall/retain as graph nodes keeps
            them <b className="text-ink">observable, retryable and conditionally skippable</b> — checkpoints capture
            memory state, and you can branch (e.g., skip retain on small talk).
          </p>
          <p>
            The sandbox orchestrator canvas is the visual analogue: mount Memory + LLM Router + Learner nodes and
            wire the same <code className="chip">facts → context → prompts → feedback</code> flow.
          </p>
          <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => (window.location.href = "/sandbox/orchestrator")}>
            Open the orchestrator canvas
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ============ Webhooks ============ */

function WebhooksTab() {
  const s = useSandbox();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["memory.retained", "observation.changed"]);
  const [openDlv, setOpenDlv] = useState<string | null>(null);

  const deliveries = useMemo(() => s.webhookDeliveries.slice(0, 30), [s.webhookDeliveries]);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Subscriptions" subtitle="event-driven downstream pipelines — deliveries are simulated in-browser (payloads are exactly what an emitter would POST)" icon={<Webhook size={15} />} />
          <div className="space-y-2.5">
            {s.webhooks.map((w) => (
              <div key={w.id} className="rounded-xl border border-border-soft bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", w.active ? "bg-ok" : "bg-faint")} />
                  <span className="text-[11.5px] font-mono text-ink truncate flex-1">{w.url}</span>
                  <button className="text-faint hover:text-danger transition-colors" onClick={() => s.removeWebhook(w.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {w.events.map((e) => (
                    <span key={e} className="chip" style={{ color: "var(--accent-2)" }}>{e}</span>
                  ))}
                </div>
                <div className="mt-2.5">
                  <Toggle checked={w.active} onChange={() => s.toggleWebhook(w.id)} label={w.active ? "Active" : "Paused"} />
                </div>
              </div>
            ))}
            {!s.webhooks.length && <p className="text-[11px] text-faint italic">No subscriptions yet.</p>}
          </div>
          <div className="border-t border-border-soft mt-3 pt-3 space-y-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.dev/…" className="text-xs font-mono" />
            <div className="flex flex-wrap gap-1">
              {WEBHOOK_EVENTS.map((e) => {
                const on = events.includes(e);
                return (
                  <button
                    key={e}
                    onClick={() => setEvents((prev) => (on ? prev.filter((x) => x !== e) : [...prev, e]))}
                    className={cn("chip cursor-pointer transition-all", on && "border-accent-border text-accent bg-accent-soft")}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!/^https?:\/\/.+/.test(url) || !events.length}
              onClick={() => {
                s.addWebhook(url.trim(), events);
                setUrl("");
              }}
            >
              <Plus size={12} /> Subscribe
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Try it" icon={<Radio size={15} />} />
          <p className="text-[11.5px] text-muted leading-relaxed mb-2.5">
            Subscribe above, then trigger events anywhere in the sandbox — retain a transcript (Memory), run a recall,
            consolidate, execute a pipeline (Orchestrator) or an eval run. Matching deliveries appear here instantly.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => s.retain("User: Webhook smoke test — the events pipeline is live.", { scopes: { appId: "sandbox-demo", runId: "smoke-test" } })}
          >
            Fire a test retain
          </Button>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] uppercase tracking-widest text-faint font-semibold">Delivery log</p>
          <span className="text-[10.5px] text-faint font-mono">{s.webhookDeliveries.length} total</span>
        </div>
        <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
          {deliveries.map((d) => (
            <div key={d.id} className="rounded-lg border border-border-soft bg-surface-2">
              <button className="w-full flex items-center gap-2 px-3 py-2 text-left" onClick={() => setOpenDlv(openDlv === d.id ? null : d.id)}>
                {openDlv === d.id ? <ChevronDown size={12} className="text-faint" /> : <ChevronRight size={12} className="text-faint" />}
                <Badge color="var(--ok)">200 · sim</Badge>
                <span className="chip" style={{ color: "var(--accent-2)" }}>{d.event}</span>
                <span className="text-[10.5px] text-faint font-mono truncate flex-1">{d.url}</span>
                <span className="text-[10px] text-faint shrink-0">{timeAgo(d.at)}</span>
              </button>
              {openDlv === d.id && (
                <pre className="px-3 pb-3 text-[10.5px] font-mono text-muted leading-relaxed overflow-x-auto anim-fade-up">
                  POST {d.url}
                  {"\n"}Content-Type: application/json
                  {"\n\n"}
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {!deliveries.length && (
            <Empty icon={<Webhook size={26} />} title="No deliveries yet" hint="Subscribe to an event, then fire the test retain." />
          )}
        </div>
      </Card>
    </div>
  );
}

/* ============ MCP server simulation ============ */

function McpTab() {
  const s = useSandbox();
  const [toolName, setToolName] = useState(MCP_TOOLS[0].name);
  const tool = MCP_TOOLS.find((t) => t.name === toolName)!;
  const [argsText, setArgsText] = useState(() => JSON.stringify(MCP_TOOLS[0].argTemplate, null, 2));
  const [result, setResult] = useState<{ content: { type: string; text: string }[]; isError: boolean } | null>(null);
  const [showManifest, setShowManifest] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const pickTool = (name: string) => {
    setToolName(name);
    const t = MCP_TOOLS.find((x) => x.name === name)!;
    setArgsText(JSON.stringify(t.argTemplate, null, 2));
    setResult(null);
  };

  const execute = () => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsText);
    } catch (e) {
      setResult({ content: [{ type: "text", text: `Error: invalid JSON arguments — ${(e as Error).message}` }], isError: true });
      return;
    }
    const st = useSandbox.getState();
    const bank = st.banks.find((b) => b.id === st.activeBankId)!;
    const bankFacts = st.facts.filter((f) => f.bankId === st.activeBankId);
    const bankObs = st.observations.filter((o) => o.bankId === st.activeBankId);
    const api: McpApi = {
      activeBankId: st.activeBankId,
      bankName: bank.name,
      retain: (content, opts) =>
        st.retain(content, { tags: opts?.tags, scopes: { userId: opts?.scopes?.userId, runId: opts?.scopes?.runId, appId: "mcp" } }),
      recall: (query, settings) => {
        const t = doRecall({
          query,
          facts: bankFacts,
          links: st.links,
          observations: bankObs,
          opinions: st.opinions.filter((o) => o.bankId === st.activeBankId),
          settings: { ...st.recallSettings, ...(settings ?? {}) },
        });
        return {
          selected: t.selected.map((c) => ({ text: c.fact.text, network: c.fact.network, score: c.finalScore, tokens: c.tokens })),
          tokensUsed: t.tokensUsed,
          latencyMs: t.latencyMs,
        };
      },
      reflect: (query) => {
        const r = doReflect({
          query,
          facts: bankFacts,
          links: st.links,
          observations: bankObs,
          opinions: st.opinions.filter((o) => o.bankId === st.activeBankId),
          settings: st.recallSettings,
          bank,
        });
        return { response: r.response, newOpinions: r.newOpinions };
      },
      searchObservations: (query) => {
        const qe = embed(query);
        return bankObs
          .map((o) => ({ o, sim: cosine(qe, embed(o.title + " " + o.content)) }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 3)
          .filter((x) => x.sim > 0.05)
          .map((x) => ({ title: x.o.title, content: x.o.content, proofCount: x.o.proofCount, trend: x.o.trend }));
      },
      updateMemory: (id, text) => st.updateFact(id, { text, note: "via MCP tool call" }),
      deleteMemory: (id) => st.deleteFact(id),
      listEntities: (topK) =>
        buildEntityIndex(bankFacts)
          .slice(0, topK)
          .map((e) => ({ name: e.name, degree: e.degree, topCooccur: e.cooccur.slice(0, 3).map((c) => c.entity) })),
    };
    const res = executeMcpTool(toolName, args, api);
    setResult(res);
    if (!res.isError) {
      s.logEvent({ app: "integrations", op: "system", message: `MCP tools/call → ${toolName}(${Object.keys(args).join(", ")})` });
    }
  };

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-4">
        <Card className="p-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[10px] uppercase tracking-widest text-faint font-semibold">tools/list · {MCP_TOOLS.length} tools</p>
            <button className="chip cursor-pointer" onClick={() => setShowManifest((v) => !v)}>
              {showManifest ? "hide manifest" : "raw manifest"}
            </button>
          </div>
          <div className="space-y-1">
            {MCP_TOOLS.map((t) => (
              <button
                key={t.name}
                onClick={() => pickTool(t.name)}
                className={cn(
                  "w-full text-left rounded-lg border px-2.5 py-2 transition-all",
                  t.name === toolName ? "border-accent-border bg-accent-soft" : "border-transparent hover:bg-surface-2"
                )}
              >
                <span className={cn("block text-[12px] font-mono font-semibold", t.name === toolName ? "text-accent" : "text-ink")}>
                  {t.name}
                </span>
                <span className="block text-[10.5px] text-faint mt-0.5 leading-snug">{t.description}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Host configuration" subtitle="for MCP-compatible clients (coding agents, desktop hosts)" icon={<Plug size={15} />} />
          <CodeBlock code={clientConfigSnippet(origin)} lang="json" title="mcp-config.json" />
        </Card>
      </div>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader
            title="tools/call playground"
            subtitle="executes against live in-browser state — the same envelope an MCP host would receive"
            icon={<Terminal size={15} />}
            right={<Badge color="var(--ok)">● server simulated</Badge>}
          />
          {showManifest && (
            <div className="mb-3 anim-fade-up">
              <CodeBlock code={JSON.stringify(tool, null, 2)} lang="json" title={`manifest · ${tool.name}`} />
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">arguments</p>
              <Textarea
                rows={10}
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                className="font-mono text-[11.5px] leading-relaxed"
                spellCheck={false}
              />
              <Button variant="primary" className="w-full mt-2" onClick={execute}>
                <Terminal size={13} /> Call {toolName}
              </Button>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-faint mb-1.5">result envelope</p>
              <div
                className={cn(
                  "rounded-xl border p-3 min-h-[248px] font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-80",
                  result ? (result.isError ? "border-danger/50 text-danger" : "border-ok/40 text-muted") : "border-border-soft text-faint"
                )}
                style={result && !result.isError ? { background: "color-mix(in srgb, var(--ok) 5%, transparent)" } : undefined}
              >
                {result ? result.content.map((c) => c.text).join("\n") : "// pick a tool and call it — results stream from the live store"}
              </div>
              {result && (
                <p className="text-[10px] font-mono mt-1.5 text-faint">
                  isError: {String(result.isError)} · content[0].type: "text"
                </p>
              )}
            </div>
          </div>
          <p className="text-[10.5px] text-faint mt-3 leading-relaxed border-t border-border-soft pt-2.5">
            The real Hindsight server ships an MCP endpoint so coding agents can read/write memory directly. This
            simulation keeps the same contract — tool names, JSON-Schema inputs, result envelopes — while executing
            against the sandbox engine, so host-side code transfers 1:1.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ============ Observability export ============ */

function ObservabilityTab() {
  const s = useSandbox();
  const [endpoint, setEndpoint] = useState("https://otel-collector.internal:4318");
  const spans = useMemo(() => eventsToSpans(s.events.slice(0, 60)), [s.events]);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader
            title="Span preview"
            subtitle={`${spans.length} spans derived from the live event stream — OTel-shaped, ready for any collector`}
            icon={<Activity size={15} />}
            right={
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => downloadBlob(toJsonl(spans), `sandbox-spans-${stamp}.jsonl`, "application/x-ndjson")}>
                  <Download size={12} /> JSONL
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBlob(spansToCsv(spans), `sandbox-spans-${stamp}.csv`, "text/csv")}>
                  <Download size={12} /> CSV
                </Button>
              </div>
            }
          />
          <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-border-soft">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0">
                <tr className="bg-surface-2 text-faint border-b border-border-soft">
                  {["name", "kind", "start", "dur", "tokens", "trace_id"].map((h) => (
                    <th key={h} className="text-left px-2.5 py-1.5 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spans.slice(0, 25).map((sp) => {
                  const dur = Number((BigInt(sp.end_time_unix_nano) - BigInt(sp.start_time_unix_nano)) / 1000000n);
                  return (
                    <tr key={sp.span_id} className="border-b border-border-soft/60 hover:bg-surface-2">
                      <td className="px-2.5 py-1.5 font-mono text-accent2 whitespace-nowrap">{sp.name}</td>
                      <td className="px-2.5 py-1.5 text-muted">{sp.kind}</td>
                      <td className="px-2.5 py-1.5 text-faint font-mono whitespace-nowrap">
                        {new Date(Number(BigInt(sp.start_time_unix_nano) / 1000000n)).toLocaleTimeString()}
                      </td>
                      <td className="px-2.5 py-1.5 text-muted font-mono">{dur}ms</td>
                      <td className="px-2.5 py-1.5 text-muted font-mono">{sp.attributes["gen_ai.usage.tokens"] ?? "—"}</td>
                      <td className="px-2.5 py-1.5 text-faint font-mono">{sp.trace_id.slice(0, 10)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bulk exports" subtitle="snapshots of everything the sandbox knows about its own behavior" icon={<Download size={15} />} />
          <div className="grid sm:grid-cols-2 gap-2.5">
            {[
              { label: "Metrics snapshot (JSON)", desc: `${s.metrics.length} apps · ops, p50/p95, error rate, throughput`, fn: () => downloadBlob(JSON.stringify(metricsSnapshot(s.metrics), null, 2), `sandbox-metrics-${stamp}.json`, "application/json") },
              { label: "Eval results (JSON)", desc: `${s.evalRuns.length} runs · accuracy by cutoff, tokens/query`, fn: () => downloadBlob(evalRunsToJson(s.evalRuns), `sandbox-evals-${stamp}.json`, "application/json") },
              { label: "Full workspace (JSON)", desc: "banks, memories, prompts, graph — same as Settings export", fn: () => {
                  const { hydrated, ...rest } = useSandbox.getState();
                  void hydrated;
                  downloadBlob(JSON.stringify(rest, null, 2), `sandbox-workspace-${stamp}.json`, "application/json");
                } },
              { label: "Spans (JSONL)", desc: `${spans.length} OTel-shaped spans from the event stream`, fn: () => downloadBlob(toJsonl(spans), `sandbox-spans-${stamp}.jsonl`, "application/x-ndjson") },
            ].map((x) => (
              <button
                key={x.label}
                onClick={x.fn}
                className="text-left rounded-xl border border-border-soft bg-surface-2 p-3 hover:border-accent-border transition-colors group"
              >
                <p className="text-[12.5px] font-medium text-ink group-hover:text-accent transition-colors flex items-center gap-1.5">
                  <Download size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" /> {x.label}
                </p>
                <p className="text-[10.5px] text-faint mt-1">{x.desc}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Connect an observer" subtitle="Respan / AgentOps / your own OTLP collector" icon={<Radio size={15} />} />
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="text-[11px] font-mono mb-2.5" />
          <CodeBlock code={observerConfigSnippet(origin)} lang="bash" title="collector bridge" />
          <div className="mt-3 space-y-2">
            <Toggle checked label="Traces (spans per operation)" onChange={() => undefined} />
            <Toggle checked label="Metrics (app fleet snapshots)" onChange={() => undefined} />
            <Toggle checked={s.evalRuns.length > 0} label="Eval results attached" onChange={() => undefined} />
          </div>
          <p className="text-[10.5px] text-faint mt-3 leading-relaxed">
            Exports are generated in-browser — nothing leaves the page until you download or wire the bridge to a
            real collector. Every retain/recall/reflect/consolidate event becomes a span with latency and token
            attributes, grouped into per-app traces.
          </p>
        </Card>
        <Card>
          <CardHeader title="Cost attribution" subtitle="the systems-study lens: where tokens go" icon={<Zap size={15} />} />
          <div className="space-y-2 text-[11.5px] text-muted leading-relaxed">
            <p>
              Spans carry <code className="chip">gen_ai.usage.tokens</code>, so an external dashboard can reproduce
              the lifecycle view: construction (retain) vs read-path (recall/reflect) token spend — the split the
              characterization study shows dominates cost decisions.
            </p>
            <div className="rounded-lg border border-border-soft bg-surface-2 p-2.5 font-mono text-[10.5px]">
              retain tokens: <span className="text-world">{s.events.filter((e) => e.op === "retain").reduce((a, e) => a + (e.tokens ?? 0), 0)}</span>
              <br />
              recall tokens: <span className="text-observation">{s.events.filter((e) => e.op === "recall").reduce((a, e) => a + (e.tokens ?? 0), 0)}</span>
              <br />
              reflect tokens: <span className="text-opinion">{s.events.filter((e) => e.op === "reflect").reduce((a, e) => a + (e.tokens ?? 0), 0)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
