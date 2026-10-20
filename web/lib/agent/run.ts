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
        const r = await executeTool(u.name, u.input, ds, (note) => emit({ type: "progress", id: u.id, note }));
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
        const r = await executeTool(c.name, args, ds, (note) => emit({ type: "progress", id: c.call_id, note }));
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

/** Free OpenRouter models, best first (Artificial Analysis Intelligence Index v4.3.2: MiniMax M3.1 Flash 43, Nemotron 3 Ultra 23). */
export const OPENROUTER_MODELS = ["minimax/minimax-m3.1-flash:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "thinkingmachines/inkling:free"];

type ORMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * OpenRouter (OpenAI-compatible chat completions) tool loop. Tries each model in turn; a model is only
 * skipped if it fails before producing any output in the current round, so answers never mix models mid-sentence.
 */
export async function runOpenRouter(opts: { apiKey: string; model?: string; messages: ChatMessage[]; context?: AgentContext; ds: DataSet; emit: Emit; signal: AbortSignal }) {
  const { apiKey, messages, context, ds, emit, signal } = opts;
  const client = new OpenAI({
    apiKey, baseURL: "https://openrouter.ai/api/v1", maxRetries: 0,
    defaultHeaders: { "HTTP-Referer": "https://github.com/srthkdev/twin", "X-Title": "Twin" },
  });
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOLS.map((t) => ({
    type: "function", function: { name: t.name, description: t.description, parameters: jsonSchemaOf(t) },
  }));
  const convo: ORMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...withContext(messages, context).map((m) => ({ role: m.role, content: m.content }) as ORMessage)];
  const chain = opts.model ? [opts.model, ...OPENROUTER_MODELS.filter((m) => m !== opts.model)] : OPENROUTER_MODELS;
  let mi = 0, live = 0, cached = 0;

  const oneRound = async (model: string) => {
    const stream = await client.chat.completions.create({ model, messages: convo, tools, tool_choice: "auto", stream: true, temperature: 0.4 }, { signal });
    let text = "", started = false;
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const chunk of stream) {
      const err = (chunk as unknown as { error?: { message?: string; code?: number } }).error;
      if (err) throw Object.assign(new Error(err.message ?? "upstream error"), { status: err.code });
      const d = chunk.choices?.[0]?.delta;
      if (!d) continue;
      if (d.content) { started = true; text += d.content; emit({ type: "text", delta: d.content }); }
      for (const tc of d.tool_calls ?? []) {
        started = true;
        const c = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: "", args: "" };
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
        calls.set(tc.index, c);
      }
    }
    return { text, calls: [...calls.values()], started };
  };

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let res: Awaited<ReturnType<typeof oneRound>> | null = null;
      while (!res) {
        const model = chain[mi];
        try {
          res = await oneRound(model);
          if (!res.started) throw Object.assign(new Error("empty response"), { status: 502 });
        } catch (e) {
          if (signal.aborted) throw e;
          if (mi < chain.length - 1) { mi++; emit({ type: "text", delta: "" }); res = null; continue; }
          throw e;
        }
      }
      if (!res.calls.length) break;
      convo.push({ role: "assistant", content: res.text || null, tool_calls: res.calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
      const outs = await Promise.all(res.calls.map(async (c) => {
        let args: unknown = {};
        try { args = JSON.parse(c.args || "{}"); } catch { /* validated by executeTool */ }
        emit({ type: "tool_call", id: c.id, name: c.name, args });
        const r = await executeTool(c.name, args, ds, (note) => emit({ type: "progress", id: c.id, note }));
        live += r.qloo.live; cached += r.qloo.cached;
        emit({ type: "tool_result", id: c.id, name: c.name, summary: r.summary, ok: r.ok, uiActions: r.uiActions, qloo: r.qloo });
        return { role: "tool" as const, tool_call_id: c.id, content: r.content };
      }));
      convo.push(...outs);
      if (round === MAX_ROUNDS - 1) emit({ type: "text", delta: "\n\n(Stopped after the maximum number of tool rounds.)" });
    }
    emit({ type: "done", provider: `openrouter · ${chain[mi].replace(/:free$/, "")}`, qlooLive: live, qlooCached: cached });
  } catch (e) {
    emit({ type: "error", message: friendly("OpenRouter", e) });
  }
}
