// Provider runtimes. Each emits StreamEvents through `emit`. Keys are passed in-memory only and never logged.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { DataSet } from "../types";
import { SYSTEM_PROMPT, contextLine } from "./prompt";
import { TOOLS, executeTool, jsonSchemaOf } from "./tools";
import type { AgentContext, ChatMessage, StreamEvent } from "./types";

export type Emit = (e: StreamEvent) => void;
export const MAX_ROUNDS = 8;
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5.5";

function withContext(messages: ChatMessage[], ctx?: AgentContext): ChatMessage[] {
  const line = contextLine(ctx);
  if (!line) return messages;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) if (out[i].role === "user") { out[i] = { ...out[i], content: line + out[i].content }; break; }
  return out;
}

function friendly(provider: string, e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return `${provider} rejected the API key (HTTP ${status}). Check the key in agent settings.`;
  if (status === 404) return `${provider} model not found (HTTP 404). Check the model name in settings.`;
  if (status === 429) return `${provider} rate limit or quota reached (HTTP 429). Try again shortly.`;
  if (status && status >= 500) return `${provider} is having trouble (HTTP ${status}). Try again.`;
  if (e instanceof Error && e.name === "AbortError") return "Cancelled.";
  const m = e instanceof Error ? e.message : String(e);
  return `${provider} request failed: ${m.replace(/sk-[A-Za-z0-9_-]+/g, "[key]").slice(0, 200)}`;
}

export async function runAnthropic(opts: { apiKey: string; model?: string; messages: ChatMessage[]; context?: AgentContext; ds: DataSet; emit: Emit; signal: AbortSignal }) {
  const { apiKey, messages, context, ds, emit, signal } = opts;
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const tools: Anthropic.Tool[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: jsonSchemaOf(t) as Anthropic.Tool["input_schema"] }));
  const convo: Anthropic.MessageParam[] = withContext(messages, context).map((m) => ({ role: m.role, content: m.content }));
  let live = 0, cached = 0;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stream = client.messages.stream({
        model: opts.model || DEFAULT_ANTHROPIC_MODEL, max_tokens: 4096, system: SYSTEM_PROMPT, tools, messages: convo,
        output_config: { effort: "medium" },
      }, { signal });
      stream.on("text", (d) => emit({ type: "text", delta: d }));
      const msg = await stream.finalMessage();
      convo.push({ role: "assistant", content: msg.content });
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !uses.length) {
        if (msg.stop_reason === "refusal") emit({ type: "error", message: "The model declined this request." });
        break;
      }
      const results = await Promise.all(uses.map(async (u) => {
        emit({ type: "tool_call", id: u.id, name: u.name, args: u.input });
        const r = await executeTool(u.name, u.input, ds);
        live += r.qloo.live; cached += r.qloo.cached;
        emit({ type: "tool_result", id: u.id, name: u.name, summary: r.summary, ok: r.ok, uiActions: r.uiActions, qloo: r.qloo });
        return { type: "tool_result" as const, tool_use_id: u.id, content: r.content, is_error: !r.ok };
      }));
      convo.push({ role: "user", content: results });
      if (round === MAX_ROUNDS - 1) emit({ type: "text", delta: "\n\n(Stopped after the maximum number of tool rounds.)" });
    }
    emit({ type: "done", provider: "anthropic", qlooLive: live, qlooCached: cached });
  } catch (e) {
    emit({ type: "error", message: friendly("Anthropic", e) });
  }
}

export async function runOpenAI(opts: { apiKey: string; model?: string; messages: ChatMessage[]; context?: AgentContext; ds: DataSet; emit: Emit; signal: AbortSignal }) {
  const { apiKey, messages, context, ds, emit, signal } = opts;
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  const tools: OpenAI.Responses.FunctionTool[] = TOOLS.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: jsonSchemaOf(t), strict: false }));
  let input: OpenAI.Responses.ResponseInput = withContext(messages, context).map((m) => ({ role: m.role, content: m.content }));
  let live = 0, cached = 0;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stream = await client.responses.create({
        model: opts.model || DEFAULT_OPENAI_MODEL, instructions: SYSTEM_PROMPT, input, tools, stream: true, store: false,
      }, { signal });
      const calls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
      const outItems: OpenAI.Responses.ResponseOutputItem[] = [];
      for await (const ev of stream) {
        if (ev.type === "response.output_text.delta") emit({ type: "text", delta: ev.delta });
        else if (ev.type === "response.output_item.done") {
          outItems.push(ev.item);
          if (ev.item.type === "function_call") calls.push(ev.item);
        } else if (ev.type === "response.failed") {
          throw new Error(ev.response.error?.message ?? "response failed");
        }
      }
      if (!calls.length) break;
      input = [...input, ...(outItems as OpenAI.Responses.ResponseInput)];
      const outs = await Promise.all(calls.map(async (c) => {
        let args: unknown = {};
        try { args = JSON.parse(c.arguments || "{}"); } catch { /* validated below */ }
        emit({ type: "tool_call", id: c.call_id, name: c.name, args });
        const r = await executeTool(c.name, args, ds);
        live += r.qloo.live; cached += r.qloo.cached;
        emit({ type: "tool_result", id: c.call_id, name: c.name, summary: r.summary, ok: r.ok, uiActions: r.uiActions, qloo: r.qloo });
        return { type: "function_call_output" as const, call_id: c.call_id, output: r.content };
      }));
      input = [...input, ...outs];
      if (round === MAX_ROUNDS - 1) emit({ type: "text", delta: "\n\n(Stopped after the maximum number of tool rounds.)" });
    }
    emit({ type: "done", provider: "openai", qlooLive: live, qlooCached: cached });
  } catch (e) {
    emit({ type: "error", message: friendly("OpenAI", e) });
  }
}
