"use client";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/lib/agent/types";
import { clearSavedKeys, type AgentSettings, type Health } from "./settings";

const LABEL: Record<ProviderId, string> = { openrouter: "Open models (free)", anthropic: "Anthropic (BYOK)", openai: "OpenAI (BYOK)", offline: "Offline" };
const HINT: Record<ProviderId, string> = {
  openrouter: "Free open-weight models via OpenRouter: MiniMax M3.1 Flash, falling back to Nemotron 3 Ultra, then Inkling. Optional: use your own OpenRouter key.",
  anthropic: "Your key is sent per request in a header, never stored server-side.",
  openai: "Your key is sent per request in a header, never stored server-side.",
  offline: "Rule-based answers from the data. No LLM, no live Qloo.",
};

export function AgentSettingsPanel({ value, onChange, health }: { value: AgentSettings; onChange: (s: AgentSettings) => void; health: Health | null }) {
  const providers: ProviderId[] = ["openrouter", "anthropic", "openai", "offline"];
  const p = value.provider;
  const byok = p === "anthropic" || p === "openai" || p === "openrouter";
  const input = "h-8 w-full border border-border bg-background px-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
  const defModel = p === "anthropic" ? health?.defaults.anthropic : p === "openai" ? health?.defaults.openai : p === "openrouter" ? health?.openrouter.models[0] : undefined;
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
      {health && p === "openrouter" && !health.openrouter.available && !value.keys.openrouter && <p className="text-destructive">No server OpenRouter key — add your own below.</p>}
      {health && !health.qloo.configured && p !== "offline" && <p className="text-destructive">QLOO_API_KEY missing on the server: live Qloo tools will fail.</p>}
      {byok && (
        <>
          <label className="block space-y-1">
            <span className="text-muted-foreground">{p === "anthropic" ? "Anthropic API key" : p === "openai" ? "OpenAI API key" : "OpenRouter key (optional — the server has one)"}</span>
            <input type="password" autoComplete="off" spellCheck={false} value={value.keys[p]} placeholder={p === "anthropic" ? "sk-ant-..." : p === "openrouter" ? "sk-or-..." : "sk-..."}
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
    </div>
  );
}
