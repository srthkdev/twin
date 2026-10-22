"use client";
import { cn } from "@/lib/utils";
import type { AgentSettings, Health } from "./settings";

const LABEL: Record<string, string> = {
  "minimax/minimax-m3.1-flash:free": "MiniMax M3.1 Flash",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra",
  "google/gemma-4-31b-it:free": "Gemma 4 31B",
};

export function AgentSettingsPanel({ value, onChange, health }: { value: AgentSettings; onChange: (s: AgentSettings) => void; health: Health | null }) {
  const models = health?.openrouter.models ?? Object.keys(LABEL);
  const current = value.model || models[0];
  const input = "h-7 w-full border border-line bg-background px-2 text-[11.5px] text-foreground outline-none placeholder:text-dim focus:border-primary";
  return (
    <div className="space-y-3 border-b border-line px-3 py-3 text-[11.5px]">
      <div>
        <div className="label mb-1.5">model · free via openrouter</div>
        <div role="radiogroup" className="flex flex-wrap gap-1">
          {models.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={current === m} onClick={() => onChange({ ...value, model: m })}
              className={cn("border px-2 py-1 transition-colors", current === m ? "border-primary bg-primary text-primary-foreground" : "border-line text-muted-foreground hover:text-foreground")}>
              {LABEL[m] ?? m}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-dim">If the chosen model is busy, OpenRouter falls back to the next one automatically.</p>
      </div>
      <label className="block space-y-1">
        <span className="label">own openrouter key · optional</span>
        <input type="password" autoComplete="off" spellCheck={false} value={value.key} placeholder="sk-or-…  (skips the demo limit)" onChange={(e) => onChange({ ...value, key: e.target.value })} className={input} />
      </label>
      <label className="flex items-center gap-2 text-muted-foreground">
        <input type="checkbox" checked={value.remember} onChange={(e) => onChange({ ...value, remember: e.target.checked })} />
        remember key in this browser
      </label>
      {health && !health.qloo.configured && <p className="text-destructive">QLOO_API_KEY missing on the server — live Qloo tools will fail.</p>}
      {health && !health.openrouter.available && !value.key && <p className="text-destructive">No server OpenRouter key — add your own above.</p>}
    </div>
  );
}
