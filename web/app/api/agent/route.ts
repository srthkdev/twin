import { NextResponse } from "next/server";
import { createRuleAgent } from "@/lib/agent/respond";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { runCodex, codexHealth } from "@/lib/agent/codex";
import { runAnthropic, runOpenAI } from "@/lib/agent/run";
import type { AgentRequest, ChatMessage, ProviderId, StreamEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body extends AgentRequest { provider?: ProviderId; model?: string }

/**
 * POST /api/agent  -> text/event-stream of StreamEvent (`data: {json}\n\n`).
 * Provider keys come ONLY from the `x-agent-key` header (BYOK); they are never stored or logged.
 * provider "offline" (or omitted) returns the legacy JSON response from the rule-based agent.
 */
export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (!Array.isArray(body.messages) || !body.messages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });
  const messages: ChatMessage[] = body.messages.slice(-20).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "").slice(0, 4000) }));
  const ds = await loadServerDataSet();
  const provider = body.provider ?? "offline";

  if (provider === "offline") return NextResponse.json(await createRuleAgent(ds).respond({ messages, context: body.context }));

  const key = req.headers.get("x-agent-key")?.trim();
  if ((provider === "anthropic" || provider === "openai") && !key) return NextResponse.json({ error: `${provider} requires an API key` }, { status: 400 });
  if (provider === "codex" && !codexHealth().available) return NextResponse.json({ error: "Codex CLI is not available here" }, { status: 400 });

  const enc = new TextEncoder();
  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort(), { once: true });
  const model = body.model?.trim().slice(0, 80) || undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: StreamEvent) => { if (!closed) { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; } } };
      try {
        if (provider === "codex") await runCodex({ model, messages, context: body.context, emit, signal: ctl.signal });
        else if (provider === "anthropic") await runAnthropic({ apiKey: key!, model, messages, context: body.context, ds, emit, signal: ctl.signal });
        else if (provider === "openai") await runOpenAI({ apiKey: key!, model, messages, context: body.context, ds, emit, signal: ctl.signal });
        else emit({ type: "error", message: `unknown provider ${provider}` });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message.replace(/sk-[A-Za-z0-9_-]+/g, "[key]") : "agent failed" });
      } finally {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
