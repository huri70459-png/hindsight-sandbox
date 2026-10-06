/* ============================================================
   MCP server simulation — a tool manifest and executor in the
   Model Context Protocol shape. The executor is injected with a
   small API surface (bound to the live store by the caller) so
   this module stays dependency-free and cycle-free.
   ============================================================ */

import type { RecallSettings } from "@/lib/types";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  argTemplate: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "retain_memory",
    description: "Extract and store memories from a message or transcript into the active bank.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Message text or transcript to extract memories from" },
        user_id: { type: "string", description: "Scope: whose memories these are" },
        run_id: { type: "string", description: "Scope: session / ticket / run" },
        tags: { type: "string", description: "Comma-separated tags" },
      },
      required: ["content"],
    },
    argTemplate: { content: "User: I moved my side project to Bun — cold starts are much faster.", user_id: "alice", run_id: "mcp-demo" },
  },
  {
    name: "recall_memory",
    description: "Token-budgeted multi-strategy retrieval over the active bank.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query" },
        max_tokens: { type: "number", description: "Context budget to fill (default from tuning)" },
        budget: { type: "string", description: "Search depth", enum: ["low", "mid", "high"] },
      },
      required: ["query"],
    },
    argTemplate: { query: "What does Alice prefer for frontend work?", budget: "mid" },
  },
  {
    name: "reflect",
    description: "Preference-conditioned answer grounded in recalled memories; may form opinions.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Question to reflect on" } },
      required: ["query"],
    },
    argTemplate: { query: "Should we standardize on Bun for new services?" },
  },
  {
    name: "search_observations",
    description: "Search consolidated, evidence-grounded observations only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "What belief to look for" } },
      required: ["query"],
    },
    argTemplate: { query: "Redis licensing" },
  },
  {
    name: "update_memory",
    description: "Replace a memory's text (revision preserved); re-categorizes automatically.",
    inputSchema: {
      type: "object",
      properties: {
        memory_id: { type: "string", description: "Target memory id" },
        text: { type: "string", description: "New content" },
      },
      required: ["memory_id", "text"],
    },
    argTemplate: { memory_id: "<paste an id from the browser>", text: "Updated content" },
  },
  {
    name: "delete_memory",
    description: "Delete one memory; derived observations are invalidated.",
    inputSchema: {
      type: "object",
      properties: { memory_id: { type: "string", description: "Target memory id" } },
      required: ["memory_id"],
    },
    argTemplate: { memory_id: "<paste an id from the browser>" },
  },
  {
    name: "list_entities",
    description: "List canonical entities in the active bank by degree (linked memory count).",
    inputSchema: {
      type: "object",
      properties: { top_k: { type: "number", description: "How many entities to return (default 10)" } },
    },
    argTemplate: { top_k: 8 },
  },
];

/** the slice of the sandbox the executor is allowed to touch */
export interface McpApi {
  activeBankId: string;
  bankName: string;
  retain(content: string, opts?: { tags?: string[]; scopes?: { userId?: string; runId?: string } }): { factCount: number };
  recall(query: string, settings?: Partial<RecallSettings>): { selected: { text: string; network: string; score: number; tokens: number }[]; tokensUsed: number; latencyMs: number };
  reflect(query: string): { response: string; newOpinions: { text: string; confidence: number }[] };
  searchObservations(query: string): { title: string; content: string; proofCount: number; trend: string }[];
  updateMemory(id: string, text: string): { ok: boolean; error?: string };
  deleteMemory(id: string): void;
  listEntities(topK: number): { name: string; degree: number; topCooccur: string[] }[];
}

export interface McpResult {
  content: { type: "text"; text: string }[];
  isError: boolean;
}

export function executeMcpTool(name: string, args: Record<string, unknown>, api: McpApi): McpResult {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  try {
    switch (name) {
      case "retain_memory": {
        const content = text(args.content);
        if (!content) return err("content is required");
        const r = api.retain(content, {
          tags: text(args.tags) ? text(args.tags).split(",").map((t) => t.trim()) : undefined,
          scopes: {
            userId: text(args.user_id) || undefined,
            runId: text(args.run_id) || undefined,
          },
        });
        return ok(`Retained into bank "${api.bankName}": ${r.factCount} memories extracted.`);
      }
      case "recall_memory": {
        const query = text(args.query);
        if (!query) return err("query is required");
        const t = api.recall(query, {
          maxTokens: num(args.max_tokens, 0) || undefined,
          budget: (["low", "mid", "high"].includes(text(args.budget)) ? text(args.budget) : undefined) as RecallSettings["budget"] | undefined,
        });
        const lines = t.selected.map((m, i) => `${i + 1}. [${m.network}] (score ${m.score.toFixed(3)}, ${m.tokens} tok) ${m.text}`);
        return ok(
          `${t.selected.length} memories · ${t.tokensUsed} tokens · ${t.latencyMs.toFixed(0)}ms\n\n${lines.join("\n") || "(nothing matched the query within budget)"}`
        );
      }
      case "reflect": {
        const query = text(args.query);
        if (!query) return err("query is required");
        const r = api.reflect(query);
        const opinions = r.newOpinions.length
          ? `\n\nOpinions formed:\n${r.newOpinions.map((o) => `- "${o.text}" (confidence ${o.confidence.toFixed(2)})`).join("\n")}`
          : "";
        return ok(r.response + opinions);
      }
      case "search_observations": {
        const query = text(args.query);
        if (!query) return err("query is required");
        const obs = api.searchObservations(query);
        if (!obs.length) return ok("No observations matched.");
        return ok(obs.map((o) => `• ${o.title}\n  ${o.content}\n  [proofs ×${o.proofCount} · trend: ${o.trend}]`).join("\n\n"));
      }
      case "update_memory": {
        const id = text(args.memory_id);
        const newText = text(args.text);
        if (!id || !newText) return err("memory_id and text are required");
        if (id.startsWith("<")) return err("Replace the placeholder with a real memory id (see the Memory app browser).");
        const r = api.updateMemory(id, newText);
        return r.ok ? ok(`Memory ${id} updated — revision stored, categories recomputed.`) : err(r.error ?? "Update failed");
      }
      case "delete_memory": {
        const id = text(args.memory_id);
        if (!id) return err("memory_id is required");
        if (id.startsWith("<")) return err("Replace the placeholder with a real memory id.");
        api.deleteMemory(id);
        return ok(`Memory ${id} deleted; derived observations invalidated.`);
      }
      case "list_entities": {
        const ents = api.listEntities(num(args.top_k, 10));
        if (!ents.length) return ok("No entities in this bank yet.");
        return ok(ents.map((e, i) => `${i + 1}. ${e.name} — degree ${e.degree}${e.topCooccur.length ? ` · co-occurs with: ${e.topCooccur.join(", ")}` : ""}`).join("\n"));
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}

function ok(text: string): McpResult {
  return { content: [{ type: "text", text }], isError: false };
}
function err(message: string): McpResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** client config snippet for MCP-compatible hosts */
export function clientConfigSnippet(origin: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "hindsight-sandbox": {
          transport: "http",
          url: `${origin}/api/mcp`,
          headers: { "x-bank": "<bank-id>" },
          note: "Sandbox simulation — the playground on this page executes tools against live in-browser state.",
        },
      },
    },
    null,
    2
  );
}
