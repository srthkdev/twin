// Codex CLI runtime: spawns `codex exec --json` with the Twin MCP server attached via -c overrides.
// Local-demo only (disabled on Vercel). Does not touch ~/.codex/config.toml.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { SYSTEM_PROMPT, contextLine } from "./prompt";
import type { AgentContext, ChatMessage, StreamEvent } from "./types";

const TIMEOUT_MS = 240_000;

export function findCodex(): string | null {
  if (process.env.VERCEL) return null;
  const dirs = [...(process.env.PATH ?? "").split(delimiter), join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  for (const d of dirs) { if (!d) continue; const p = join(d, "codex"); if (existsSync(p)) return p; }
  return null;
}
const tsxBin = () => join(process.cwd(), "node_modules", ".bin", "tsx");
const mcpScript = () => join(process.cwd(), "mcp", "twin-mcp.mts");

export function codexHealth(): { available: boolean; reason?: string } {
  if (process.env.VERCEL) return { available: false, reason: "disabled on Vercel" };
  if (!findCodex()) return { available: false, reason: "codex CLI not found on PATH" };
  if (!existsSync(tsxBin()) || !existsSync(mcpScript())) return { available: false, reason: "Twin MCP server not installed (run pnpm install)" };
  return { available: true };
}

function buildPrompt(messages: ChatMessage[], ctx?: AgentContext): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const history = messages.slice(0, messages.lastIndexOf(last!)).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  return [
    "<operating_instructions>",
    SYSTEM_PROMPT,
    "",
    "Runtime notes: your tools are the `twin` MCP server (find_twins, explain_match, taste_profile, where_in_city, pin_twins, local_scene, audience, cross_domain, search_hoods, list_cities). Use ONLY those tools. Do not run shell commands, read files or browse the web. Ignore any `<twin-meta>` trailer in tool output; it is for the UI.",
    "</operating_instructions>",
    history ? `\n<conversation_so_far>\n${history}\n</conversation_so_far>` : "",
    `\n${contextLine(ctx)}User: ${last?.content ?? ""}`,
  ].join("\n");
}

const META_RE = /<twin-meta>([\s\S]*?)<\/twin-meta>/;

export async function runCodex(opts: { model?: string; messages: ChatMessage[]; context?: AgentContext; emit: (e: StreamEvent) => void; signal: AbortSignal }) {
  const { emit, signal } = opts;
  const bin = findCodex();
  if (!bin) { emit({ type: "error", message: "Codex CLI is not available on this machine." }); return; }
  const dir = await mkdtemp(join(tmpdir(), "twin-codex-"));
  const args = [
    "exec", "--json", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", dir,
    "-c", `mcp_servers.twin.command=${JSON.stringify(tsxBin())}`,
    "-c", `mcp_servers.twin.args=${JSON.stringify([mcpScript()])}`,
    "-c", 'mcp_servers.twin.default_tools_approval_mode="approve"',
    "-c", 'web_search="disabled"',
  ];
  if (opts.model) args.push("-m", opts.model);
  args.push("-");

  let live = 0, cached = 0, finished = false, sawText = false;
  const child = spawn(bin, args, { cwd: dir, stdio: ["pipe", "pipe", "pipe"], env: process.env });
  child.stdin.end(buildPrompt(opts.messages, opts.context));
  const kill = () => { if (!child.killed) child.kill("SIGTERM"); setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 3000).unref(); };
  const timer = setTimeout(() => { emit({ type: "error", message: "Codex timed out." }); finished = true; kill(); }, TIMEOUT_MS);
  signal.addEventListener("abort", kill, { once: true });

  let buf = "", errBuf = "";
  child.stderr.on("data", (d: Buffer) => { errBuf = (errBuf + d.toString()).slice(-2000); });

  const handle = (line: string) => {
    let ev: { type: string; item?: Record<string, unknown>; message?: string; error?: { message?: string } };
    try { ev = JSON.parse(line); } catch { return; }
    const it = ev.item as { id: string; type: string; text?: string; tool?: string; arguments?: unknown; result?: { content?: { type: string; text?: string }[] } | null; error?: { message?: string } | null; command?: string; status?: string } | undefined;
    if (ev.type === "item.completed" && it?.type === "agent_message" && it.text) {
      emit({ type: "text", delta: (sawText ? "\n\n" : "") + it.text.trim() });
      sawText = true;
    } else if (ev.type === "item.started" && it?.type === "mcp_tool_call") {
      emit({ type: "tool_call", id: it.id, name: it.tool ?? "tool", args: it.arguments });
    } else if (ev.type === "item.completed" && it?.type === "mcp_tool_call") {
      const texts = (it.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "");
      let meta: { summary?: string; ok?: boolean; uiActions?: never[]; qloo?: { live: number; cached: number } } = {};
      for (const t of texts) { const m = META_RE.exec(t); if (m) { try { meta = JSON.parse(m[1]); } catch { /* ignore */ } } }
      if (meta.qloo) { live += meta.qloo.live; cached += meta.qloo.cached; }
      const failed = it.status === "failed" || !!it.error;
      emit({ type: "tool_result", id: it.id, name: it.tool ?? "tool", ok: !failed && meta.ok !== false, summary: failed ? it.error?.message ?? "tool failed" : meta.summary ?? "ok", uiActions: meta.uiActions ?? [], qloo: meta.qloo });
    } else if (ev.type === "item.started" && it?.type === "command_execution") {
      emit({ type: "tool_call", id: it.id, name: "shell", args: { command: it.command } });
    } else if (ev.type === "item.completed" && it?.type === "command_execution") {
      emit({ type: "tool_result", id: it.id, name: "shell", ok: true, summary: "sandboxed shell command (read-only)", uiActions: [] });
    } else if (ev.type === "turn.completed") {
      if (!finished) { finished = true; emit({ type: "done", provider: "codex", qlooLive: live, qlooCached: cached }); }
    } else if (ev.type === "turn.failed" || ev.type === "error") {
      const m = ev.error?.message ?? ev.message ?? "Codex failed";
      if (!/^Reconnecting/i.test(m) && !finished) { finished = true; emit({ type: "error", message: `Codex: ${m.slice(0, 300)}` }); }
    }
  };

  await new Promise<void>((resolve) => {
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
    });
    child.on("error", (e) => { if (!finished) { finished = true; emit({ type: "error", message: `Could not start Codex: ${e.message}` }); } resolve(); });
    child.on("close", (code) => {
      if (buf.trim()) handle(buf.trim());
      if (!finished && !signal.aborted) { finished = true; emit({ type: "error", message: `Codex exited with code ${code}. ${errBuf.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200)}` }); }
      resolve();
    });
  });
  clearTimeout(timer);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
