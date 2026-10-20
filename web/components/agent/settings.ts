import type { ProviderId } from "@/lib/agent/types";

export interface AgentSettings {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  keys: { anthropic: string; openai: string; openrouter: string };
  remember: boolean;
}
export interface Health { openrouter: { available: boolean; models: string[] }; qloo: { configured: boolean }; defaults: { anthropic: string; openai: string } }

const KEY = "twin.agent.settings.v1";
export const emptySettings = (): AgentSettings => ({ provider: "openrouter", models: {}, keys: { anthropic: "", openai: "", openrouter: "" }, remember: false });

/** Keys are persisted only when the user ticked "remember". Everything else is per-session memory. */
export function loadSettings(): AgentSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AgentSettings>;
    return { ...emptySettings(), ...s, keys: { anthropic: s.keys?.anthropic ?? "", openai: s.keys?.openai ?? "", openrouter: s.keys?.openrouter ?? "" } };
  } catch { return null; }
}
export function saveSettings(s: AgentSettings) {
  try {
    if (s.remember) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.setItem(KEY, JSON.stringify({ ...s, keys: { anthropic: "", openai: "", openrouter: "" } }));
  } catch { /* storage unavailable */ }
}
export function clearSavedKeys() {
  try { const s = loadSettings(); if (s) localStorage.setItem(KEY, JSON.stringify({ ...s, remember: false, keys: { anthropic: "", openai: "", openrouter: "" } })); } catch { /* ignore */ }
}
