// AI SDK wiring: Twin's tool registry as AI SDK tools, and an OpenRouter model with native fallback.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { tool, type LanguageModel, type ToolSet, type UIMessage, type UIMessageStreamWriter } from "ai";
import type { DataSet } from "../types";
import { executeTool, TOOLS } from "./tools";
import { collectNumbers } from "./report";
import type { AgentRunContext } from "./report";

/** Free OpenRouter models, best first (Artificial Analysis Intelligence Index v4.3.2: MiniMax M3.1 Flash 43, Nemotron 3 Ultra 23). */
// Inkling is free only inside agentic harnesses (403 over the API), so it is not a fallback. The daily free cap is per account.
export const OPENROUTER_MODELS = ["minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free"];

// Server keys (OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, …). Free models are capped per account per UTC day, so a key
// that hits its cap is skipped until midnight UTC and the next key answers.
const serverKeys = () => Object.keys(process.env).filter((k) => /^OPENROUTER_API_KEY(_\d+)?$/.test(k)).sort().map((k) => process.env[k]!.trim()).filter(Boolean);
export const cappedOn = new Map<string, number>();
export const utcDay = () => Math.floor(Date.now() / 86_400_000);
/** Server keys, the ones still under today's cap first (all of them if every one is capped). */
export const usableKeys = () => { const keys = serverKeys(), open = keys.filter((k) => cappedOn.get(k) !== utcDay()); return open.length ? open : keys; };
export const isDailyCap = (text: string) => /free-models-per-day|per-day|PerDay|daily/i.test(text);

/** Google AI Studio (free tier): fast and good at parallel tool calls, so it answers first when configured. */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
const gemini = (apiKey: string) => createOpenAICompatible({ name: "gemini", apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", includeUsage: true });

export interface Attempt { label: string; capKey: string; model: LanguageModel; providerOptions?: ReturnType<typeof fallbackOptions> }
/**
 * Every model the agent may use for one run, in order. A visitor's own OpenRouter key replaces the server's. Otherwise
 * Gemini first, then each server OpenRouter key's free models. A model the visitor picked in settings goes first.
 */
export function agentAttempts(picked: string | undefined, userKey?: string): Attempt[] {
  const order = picked && OPENROUTER_MODELS.includes(picked) ? [picked, ...OPENROUTER_MODELS.filter((m) => m !== picked)] : OPENROUTER_MODELS;
  const viaOpenRouter = (key: string) => order.map((m) => ({ label: m, capKey: key, model: openrouter(key)(m), providerOptions: fallbackOptions(m) }));
  if (userKey) return viaOpenRouter(userKey);
  const g = process.env.GEMINI_API_KEY?.trim();
  const google = g ? [{ label: `google/${GEMINI_MODEL}`, capKey: g, model: gemini(g)(GEMINI_MODEL) }] : [];
  const routed = usableKeys().flatMap(viaOpenRouter);
  return picked && OPENROUTER_MODELS.includes(picked) ? [...routed, ...google] : [...google, ...routed];
}

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
