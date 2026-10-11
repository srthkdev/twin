"use client";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/lib/agent/types";
import { clearSavedKeys, type AgentSettings, type Health } from "./settings";

const LABEL: Record<ProviderId, string> = { codex: "Codex CLI", anthropic: "Anthropic (BYOK)", openai: "OpenAI (BYOK)", offline: "Offline" };
const HINT: Record<ProviderId, string> = {
  codex: "Local demo: runs your logged-in codex CLI with the Twin MCP server.",
  anthropic: "Your key is sent per request in a header, never stored server-side.",
  openai: "Your key is sent per request in a header, never stored server-side.",
  offline: "Rule-based answers from the data. No LLM, no live Qloo.",
};

export function AgentSettingsPanel({ value, onChange, health }: { value: AgentSettings; onChange: (s: AgentSettings) => void; health: Health | null }) {
  const providers: ProviderId[] = [...(health?.codex.available ? (["codex"] as const) : []), "anthropic", "openai", "offline"];
  const p = value.provider;
  const byok = p === "anthropic" || p === "openai";
  const input = "h-8 w-full border border-border bg-background px-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
  const defModel = p === "anthropic" ? health?.defaults.anthropic : p === "openai" ? health?.defaults.openai : undefined;
  return (
    <div className="space-y-2 border-b border-border p-3 text-xs">
      <div role="radiogroup" aria-label="Provider" className="flex flex-wrap gap-1">
        {providers.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={p === id} onClick={() => onChange({ ...value, provider: id })}
            className={cn("border border-border px-2 py-1 font-mono", p === id ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted")}>
            {LABEL[id]}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground">{HINT[p]}</p>
      {health && !health.codex.available && <p className="text-muted-foreground">Codex CLI unavailable: {health.codex.reason}.</p>}
      {health && !health.qloo.configured && p !== "offline" && <p className="text-destructive">QLOO_API_KEY missing on the server: live Qloo tools will fail.</p>}
      {byok && (
        <>
          <label className="block space-y-1">
            <span className="text-muted-foreground">{p === "anthropic" ? "Anthropic API key" : "OpenAI API key"}</span>
            <input type="password" autoComplete="off" spellCheck={false} value={value.keys[p]} placeholder={p === "anthropic" ? "sk-ant-..." : "sk-..."}
              onChange={(e) => onChange({ ...value, keys: { ...value.keys, [p]: e.target.value } })} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Model {defModel ? `(default ${defModel})` : ""}</span>
            <input value={value.models[p] ?? ""} placeholder={defModel} onChange={(e) => onChange({ ...value, models: { ...value.models, [p]: e.target.value } })} className={input} />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={value.remember} onChange={(e) => { if (!e.target.checked) clearSavedKeys(); onChange({ ...value, remember: e.target.checked }); }} />
            Remember key in this browser (localStorage)
          </label>
        </>
      )}
      {p === "codex" && (
        <label className="block space-y-1">
          <span className="text-muted-foreground">Model override (optional, uses your codex default)</span>
          <input value={value.models.codex ?? ""} onChange={(e) => onChange({ ...value, models: { ...value.models, codex: e.target.value } })} className={input} />
        </label>
      )}
    </div>
  );
}
