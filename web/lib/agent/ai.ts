// AI SDK wiring: Twin's tool registry as AI SDK tools, and an OpenRouter model with native fallback.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { tool, type ToolSet, type UIMessage, type UIMessageStreamWriter } from "ai";
import type { DataSet } from "../types";
import { executeTool, TOOLS } from "./tools";
import { collectNumbers } from "./report";
import type { AgentRunContext } from "./report";

/** Free OpenRouter models, best first (Artificial Analysis Intelligence Index v4.3.2: MiniMax M3.1 Flash 43, Nemotron 3 Ultra 23). */
export const OPENROUTER_MODELS = ["minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "thinkingmachines/inkling:free"];

export function openrouter(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: { "HTTP-Referer": "https://github.com/srthkdev/twin", "X-Title": "Twin" },
    includeUsage: true,
  });
}
/** OpenRouter routes to the next model itself when one is rate-limited or down (`models` = fallback list). */
export const fallbackOptions = (primary: string) => ({
  openrouter: {
    models: [primary, ...OPENROUTER_MODELS.filter((m) => m !== primary)].slice(0, 3),
    // Tool-heavy turns don't need long hidden reasoning; low effort roughly halves answer time.
    reasoning: { effort: "low" },
  },
});

export interface RunMeta { model?: string; qlooLive: number; qlooCached: number; ms?: number }
export type TwinUIMessage = UIMessage<RunMeta>;

/** Wrap every registry tool for the AI SDK. Progress and map actions go out as transient data parts. */
export function aiTools(ds: DataSet, writer: UIMessageStreamWriter, meta: RunMeta, run: AgentRunContext = { evidence: [], charts: new Map(), nextChartId: 1 }): ToolSet {
  const out: ToolSet = {};
  for (const t of TOOLS) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.schema,
      execute: async (args: unknown, { toolCallId }: { toolCallId: string }) => {
        if (t.name === "report_skill") run.reportMode = true;
        const entry = { tool: t.name, summary: `${t.name} requested`, numbers: [] as number[] };
        run.evidence.push(entry);
        const r = await executeTool(t.name, args, ds, (note) => writer.write({ type: "data-progress", id: toolCallId, data: { toolCallId, note }, transient: true }), run);
        meta.qlooLive += r.qloo.live; meta.qlooCached += r.qloo.cached;
        for (const a of r.uiActions) writer.write({ type: "data-action", data: a, transient: true });
        let data: unknown;
        try { data = JSON.parse(r.content); } catch { data = r.content; }
        entry.summary = r.summary;
        entry.numbers = r.ok ? collectNumbers(r.data ?? data) : [];
        return { ok: r.ok, summary: r.summary, qloo: r.qloo, data };
      },
    } as never);
  }
  return out;
}
