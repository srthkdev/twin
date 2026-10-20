export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface AgentContext { fromHood?: string | null; toCity?: string | null }

/** UI actions emitted by tools; the explore page applies them to the map. */
export type AgentAction =
  | { type: "select"; from: string; to: string; twin?: string }
  | { type: "showTwins"; from: string; to: string; twin?: string }
  | { type: "flyTo"; hood: string }
  | { type: "highlightCells"; city: string; item: number; label: string }
  | { type: "addCity"; city: AgentCity }
  | { type: "opportunity"; city: string; kind: string; taste: string; cells: OpportunityCell[] }
  | { type: "download"; filename: string; markdown: string };

/** City record as served by /api/cities (static + live). Mirrors CONTRACT.md City plus source/dims/coverage. */
export interface AgentCity {
  id: string; name: string; country: string; center: [number, number]; zoom: number; cellCount: number; hoodCount: number;
  source: "static" | "live"; dims: 116 | 40; coverage?: { cells: number; sparseItems: number; itemsWithData?: number; failedItems?: number; hoodSource?: string };
}
/** One map cell of an opportunity result: demand/score are z-scores within the city, supply is an OSM venue count. */
export interface OpportunityCell { g: string; lon: number; lat: number; demand: number; supply: number; score: number }

export interface AgentRequest { messages: ChatMessage[]; context?: AgentContext }
export interface AgentResponse { reply: string; actions?: AgentAction[]; intent: string }

/** Rule-based (offline) agent contract. */
export interface Agent { respond(req: AgentRequest): Promise<AgentResponse> }

export type ProviderId = "openrouter" | "anthropic" | "openai" | "offline";

/** Server -> client SSE events from POST /api/agent. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; summary: string; ok: boolean; uiActions: AgentAction[]; qloo?: { live: number; cached: number } }
  | { type: "progress"; id: string; note: string }
  | { type: "error"; message: string }
  | { type: "done"; provider: string; qlooLive?: number; qlooCached?: number };
