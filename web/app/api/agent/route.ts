import { NextResponse } from "next/server";
import { createRuleAgent } from "@/lib/agent/respond";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { runAnthropic, runOpenAI, runOpenRouter } from "@/lib/agent/run";
import type { AgentRequest, ChatMessage, ProviderId, StreamEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body extends AgentRequest { provider?: ProviderId; model?: string }

/**
 * POST /api/agent  -> text/event-stream of StreamEvent (`data: {json}\n\n`).
 * Provider keys come from the `x-agent-key` header (BYOK) and are never stored or logged. "openrouter" falls back to the
 * server's OPENROUTER_API_KEY, rate-limited per client IP so a public demo can't drain it.
 * provider "offline" (or omitted) returns the legacy JSON response from the rule-based agent.
 */
// Server-key budget per client: a few questions per minute is plenty for a demo, and each question is up to 8 model calls.
const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const h = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (h.length >= MAX_PER_WINDOW) { hits.set(ip, h); return false; }
  h.push(now); hits.set(ip, h);
  return true;
}

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
  let orKey = "";
  if (provider === "openrouter") {
    orKey = key || process.env.OPENROUTER_API_KEY || "";
    if (!orKey) return NextResponse.json({ error: "No OpenRouter key on the server — add your own in agent settings." }, { status: 400 });
    if (!key) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
      if (!allow(ip)) return NextResponse.json({ error: "Demo limit reached (12 questions per 10 minutes). Add your own OpenRouter key in settings to keep going." }, { status: 429 });
    }
  }

  const enc = new TextEncoder();
  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort(), { once: true });
  const model = body.model?.trim().slice(0, 80) || undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: StreamEvent) => { if (!closed) { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; } } };
      try {
        if (provider === "openrouter") await runOpenRouter({ apiKey: orKey, model, messages, context: body.context, ds, emit, signal: ctl.signal });
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
