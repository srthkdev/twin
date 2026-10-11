export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface AgentContext { fromHood?: string | null; toCity?: string | null }

/** UI actions emitted by tools; the explore page applies them to the map. */
export type AgentAction =
  | { type: "select"; from: string; to: string; twin?: string }
  | { type: "showTwins"; from: string; to: string; twin?: string }
  | { type: "flyTo"; hood: string }
  | { type: "highlightCells"; city: string; item: number; label: string };

export interface AgentRequest { messages: ChatMessage[]; context?: AgentContext }
export interface AgentResponse { reply: string; actions?: AgentAction[]; intent: string }

/** Rule-based (offline) agent contract. */
export interface Agent { respond(req: AgentRequest): Promise<AgentResponse> }

export type ProviderId = "codex" | "anthropic" | "openai" | "offline";

/** Server -> client SSE events from POST /api/agent. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; summary: string; ok: boolean; uiActions: AgentAction[]; qloo?: { live: number; cached: number } }
  | { type: "error"; message: string }
  | { type: "done"; provider: ProviderId; qlooLive?: number; qlooCached?: number };
