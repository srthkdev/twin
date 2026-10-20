// AI SDK wiring: Twin's tool registry as AI SDK tools, an OpenRouter model with native fallback,
// and helpers to record/replay UI message streams (so demos and UI work don't spend free-tier quota).
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { tool, type ToolSet, type UIMessage, type UIMessageStreamWriter } from "ai";
import type { DataSet } from "../types";
import { executeTool, TOOLS } from "./tools";
import { storeGet, storePut } from "./store";

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
export function aiTools(ds: DataSet, writer: UIMessageStreamWriter, meta: RunMeta): ToolSet {
  const out: ToolSet = {};
  for (const t of TOOLS) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.schema,
      execute: async (args: unknown, { toolCallId }: { toolCallId: string }) => {
        const r = await executeTool(t.name, args, ds, (note) => writer.write({ type: "data-progress", id: toolCallId, data: { toolCallId, note }, transient: true }));
        meta.qlooLive += r.qloo.live; meta.qlooCached += r.qloo.cached;
        for (const a of r.uiActions) writer.write({ type: "data-action", data: a, transient: true });
        let data: unknown;
        try { data = JSON.parse(r.content); } catch { data = r.content; }
        return { ok: r.ok, summary: r.summary, qloo: r.qloo, data };
      },
    } as never);
  }
  return out;
}

// ───────── record / replay ─────────
type Frame = [ms: number, chunk: unknown];
export interface Recording { name: string; question: string; context: unknown; recordedAt: string; frames: Frame[] }
export const replayKey = (name: string) => `replays/${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60)}.json`;

/** Tee a UI message stream into a recording saved under `name` when it finishes. */
export function recorder(name: string, question: string, context: unknown) {
  const t0 = Date.now(), frames: Frame[] = [];
  return new TransformStream({
    transform(chunk, ctl) { frames.push([Date.now() - t0, chunk]); ctl.enqueue(chunk); },
    async flush() { await storePut(replayKey(name), { name, question, context, recordedAt: new Date().toISOString(), frames } satisfies Recording); },
  });
}

/** Replay a recording with its original timing (sped up by `speed`). */
export async function replayStream(name: string, speed = 1): Promise<ReadableStream | null> {
  const rec = await storeGet<Recording>(replayKey(name));
  if (!rec) return null;
  return new ReadableStream({
    async start(ctl) {
      let last = 0;
      for (const [ms, chunk] of rec.frames) {
        const wait = (ms - last) / speed;
        if (wait > 4) await new Promise((r) => setTimeout(r, Math.min(wait, 2500)));
        last = ms;
        ctl.enqueue(chunk);
      }
      ctl.close();
    },
  });
}
