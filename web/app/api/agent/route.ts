import { NextResponse, after } from "next/server";
import { type ModelMessage, consumeStream, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type ToolSet } from "ai";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { OPENROUTER_MODELS, aiTools, fallbackOptions, openrouter, type RunMeta, type TwinUIMessage } from "@/lib/agent/ai";
import { SYSTEM_PROMPT, contextLine } from "@/lib/agent/prompt";
import { repairToolCall } from "@/lib/agent/repair";
import type { AgentRunContext } from "@/lib/agent/report";
import type { AgentContext } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body { messages: TwinUIMessage[]; context?: AgentContext; model?: string }

// Server-key budget per client: up to 8 steps normally, 16 for report work.
const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), h = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (h.length >= MAX_PER_WINDOW) { hits.set(ip, h); return false; }
  h.push(now); hits.set(ip, h);
  return true;
}

/**
 * POST /api/agent — AI SDK UI message stream.
 * The OpenRouter key is the server's, or the visitor's own via the `x-agent-key` header (never stored or logged).
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  if (!Array.isArray(body.messages) || !body.messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const userKey = req.headers.get("x-agent-key")?.trim();
  const apiKey = userKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No OpenRouter key on the server — add your own in agent settings." }, { status: 400 });
  if (!userKey) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    if (!allow(ip)) return NextResponse.json({ error: "Demo limit reached (20 questions per 10 minutes). Add your own OpenRouter key in settings to keep going." }, { status: 429 });
  }

  const ds = await loadServerDataSet();
  // history: keep answers and finished tool results; drop old reasoning and transient parts (cheaper, and some providers reject them)
  const messages = body.messages.slice(-16).map((m, i, all) => i === all.length - 1 ? m : {
    ...m, parts: m.parts.filter((p) => p.type !== "reasoning" && !p.type.startsWith("data-")),
  }).filter((m) => m.parts.length);
  const ctx = contextLine(body.context);
  const primary = body.model && OPENROUTER_MODELS.includes(body.model) ? body.model : OPENROUTER_MODELS[0];
  const meta: RunMeta = { qlooLive: 0, qlooCached: 0 };
  const question = [...messages].reverse().find((m) => m.role === "user")?.parts.flatMap((p) => p.type === "text" ? [p.text] : []).join("\n").trim();
  const reportRun = /\b(report|plan|analysis|comparison|compare|deep dive)\b/i.test(question ?? "");
  const userName = req.headers.get("x-twin-user")?.trim().toLowerCase(), userCode = req.headers.get("x-twin-code")?.trim();
  const run: AgentRunContext = { user: userName && userCode ? { name: userName, code: userCode } : undefined, evidence: [], charts: new Map(), nextChartId: 1, question, model: () => meta.model, reportMode: reportRun };
  const t0 = Date.now();

  const stream = createUIMessageStream<TwinUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true });
      if (ctx) {
        const last = [...modelMessages].reverse().find((m) => m.role === "user");
        if (last && typeof last.content === "string") last.content = ctx + last.content;
        else if (last && Array.isArray(last.content)) last.content = [{ type: "text", text: ctx }, ...last.content] as typeof last.content;
      }
      // Free models sometimes fail or stall (one kept "thinking" for 3+ minutes). Any step that errors or runs past
      // its time limit hands the turn to the next model, which continues from every finished step and tool result;
      // the user sees one continuous answer.
      const order = [primary, ...OPENROUTER_MODELS.filter((m) => m !== primary)];
      const done: ModelMessage[] = [];
      for (let i = 0; i < order.length; i++) {
        const last = i === order.length - 1;
        const result = streamText({
          model: openrouter(apiKey)(order[i]),
          instructions: SYSTEM_PROMPT,
          messages: [...modelMessages, ...done],
          tools: aiTools(ds, writer, meta, run),
          stopWhen: (options) => isStepCount(run.reportMode ? 16 : 8)(options),
          // the last step must be an answer, never another tool call
          prepareStep: ({ stepNumber }) => (stepNumber >= (run.reportMode ? 15 : 7) ? { toolChoice: "none" as const } : undefined),
          timeout: { firstChunkMs: 30_000, chunkMs: 45_000, stepMs: 100_000 },
          temperature: 0.4,
          // a 429 means a daily or per-minute cap: retrying the same model only waits; the next model answers now
          maxRetries: 0,
          repairToolCall,
          providerOptions: fallbackOptions(order[i]),
          onStepFinish: (step) => { meta.model = step.response?.modelId ?? meta.model; done.push(...step.response.messages); },
        });
        let shown = false, retry = false;
        const parts = toUIMessageStream<ToolSet, TwinUIMessage>({
          stream: result.stream,
          sendStart: i === 0,
          messageMetadata: ({ part }) => (part.type === "finish" ? { ...meta, ms: Date.now() - t0 } : undefined),
          onError: (e) => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e) ?? "agent failed").replace(/sk-[A-Za-z0-9_-]+/g, "[key]").slice(0, 300),
        });
        const reader = parts.getReader();
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          const chunk = r.value;
          if (chunk.type === "error" && !last) { retry = true; void reader.cancel(); break; }
          if (chunk.type !== "start" && chunk.type !== "start-step" && chunk.type !== "finish-step") shown = true;
          writer.write(chunk);
        }
        if (!retry) break;
        console.warn(`[agent] ${order[i]} failed or stalled${shown ? " mid-answer" : ""}; continuing with ${order[i + 1]} from ${done.length} finished messages`);
      }
    },
  });

  // The run is consumed server-side to the end even if the browser leaves (reports keep going in the background and
  // land in the user's history); a heartbeat keeps proxies from dropping long, quiet thinking steps.
  return createUIMessageStreamResponse({ stream, keepAliveMs: 15_000, consumeSseStream: ({ stream: copy }) => after(consumeStream({ stream: copy })) });
}
