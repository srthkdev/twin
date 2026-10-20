export interface AgentSettings { model: string; key: string; remember: boolean }
export interface Health { openrouter: { available: boolean; models: string[] }; qloo: { configured: boolean } }

const KEY = "twin.agent.settings.v2";
export const emptySettings = (): AgentSettings => ({ model: "", key: "", remember: false });

/** The visitor's own key is persisted only when they tick "remember". */
export function loadSettings(): AgentSettings | null {
  try { const raw = localStorage.getItem(KEY); return raw ? { ...emptySettings(), ...(JSON.parse(raw) as Partial<AgentSettings>) } : null; } catch { return null; }
}
export function saveSettings(s: AgentSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s.remember ? s : { ...s, key: "" })); } catch { /* storage unavailable */ }
}
