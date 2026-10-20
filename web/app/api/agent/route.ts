import { NextResponse } from "next/server";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { OPENROUTER_MODELS, aiTools, fallbackOptions, openrouter, type RunMeta, type TwinUIMessage } from "@/lib/agent/ai";
import { SYSTEM_PROMPT, contextLine } from "@/lib/agent/prompt";
import type { AgentContext } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body { messages: TwinUIMessage[]; context?: AgentContext; model?: string }

// Server-key budget per client: each question can be up to 8 model calls on a free tier.
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
  const t0 = Date.now();

  const stream = createUIMessageStream<TwinUIMessage>({
    execute: async ({ writer }) => {
      const modelMessages = await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true });
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
        // the last step must be an answer, never another tool call
        prepareStep: ({ stepNumber }) => (stepNumber >= 7 ? { toolChoice: "none" as const } : undefined),
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

  return createUIMessageStreamResponse({ stream });
}
