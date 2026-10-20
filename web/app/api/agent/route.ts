import { NextResponse } from "next/server";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { OPENROUTER_MODELS, aiTools, fallbackOptions, openrouter, recorder, replayStream, type RunMeta, type TwinUIMessage } from "@/lib/agent/ai";
import { SYSTEM_PROMPT, contextLine } from "@/lib/agent/prompt";
import type { AgentContext } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body { messages: TwinUIMessage[]; context?: AgentContext; model?: string; record?: string; replay?: string; speed?: number }

// Server-key budget per client: each question can be up to 8 model calls on a free tier.
const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), h = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (h.length >= MAX_PER_WINDOW) { hits.set(ip, h); return false; }
  h.push(now); hits.set(ip, h);
  return true;
}

/**
 * POST /api/agent — AI SDK UI message stream.
 * `replay: name` streams a stored recording (no model or Qloo calls); `record: name` saves this run for replay.
 * The OpenRouter key is the server's, or the visitor's own via the `x-agent-key` header (never stored or logged).
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // Record/replay exist for development and making demo videos; production always runs the real agent.
  const devTools = process.env.NODE_ENV !== "production" || process.env.TWIN_ALLOW_REPLAY === "1";
  if (!devTools) { body.replay = undefined; body.record = undefined; }
  if (body.replay) {
    const s = await replayStream(body.replay, Math.min(8, Math.max(0.5, body.speed ?? 1)));
    if (!s) return NextResponse.json({ error: `no recording named ${body.replay}` }, { status: 404 });
    return createUIMessageStreamResponse({ stream: s });
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const userKey = req.headers.get("x-agent-key")?.trim();
  const apiKey = userKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No OpenRouter key on the server — add your own in agent settings." }, { status: 400 });
  if (!userKey) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    if (!allow(ip)) return NextResponse.json({ error: "Demo limit reached (12 questions per 10 minutes). Add your own OpenRouter key in settings to keep going." }, { status: 429 });
  }

  const ds = await loadServerDataSet();
  const messages = body.messages.slice(-16);
  const ctx = contextLine(body.context);
  const primary = body.model && OPENROUTER_MODELS.includes(body.model) ? body.model : OPENROUTER_MODELS[0];
  const meta: RunMeta = { qlooLive: 0, qlooCached: 0 };
  const t0 = Date.now();

  const stream = createUIMessageStream<TwinUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = await convertToModelMessages(messages);
      if (ctx) {
        const last = [...modelMessages].reverse().find((m) => m.role === "user");
        if (last && typeof last.content === "string") last.content = ctx + last.content;
        else if (last && Array.isArray(last.content)) last.content = [{ type: "text", text: ctx }, ...last.content] as typeof last.content;
      }
      const result = streamText({
        model: openrouter(apiKey)(primary),
        instructions: SYSTEM_PROMPT,
        messages: modelMessages,
        tools: aiTools(ds, writer, meta),
        stopWhen: isStepCount(8),
        temperature: 0.4,
        providerOptions: fallbackOptions(primary),
        onStepFinish: (step) => { meta.model = step.response?.modelId ?? meta.model; },
      });
      writer.merge(toUIMessageStream({
        stream: result.stream,
        messageMetadata: ({ part }) => (part.type === "finish" ? { ...meta, ms: Date.now() - t0 } : undefined),
        onError: (e) => (e instanceof Error ? e.message.replace(/sk-[A-Za-z0-9_-]+/g, "[key]").slice(0, 300) : "agent failed"),
      }));
    },
  });

  const recordName = body.record?.trim();
  const question = (messages[messages.length - 1]?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ");
  return createUIMessageStreamResponse({ stream: recordName ? stream.pipeThrough(recorder(recordName, question, body.context)) : stream });
}
