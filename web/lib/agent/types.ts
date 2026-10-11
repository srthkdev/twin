export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface AgentContext { fromHood?: string | null; toCity?: string | null }
export interface AgentAction { type: "select"; from: string; to: string; twin?: string }
export interface AgentRequest { messages: ChatMessage[]; context?: AgentContext }
export interface AgentResponse { reply: string; actions?: AgentAction[]; intent: string }

/** Anything that can turn a request into a response. A future LLM-backed agent implements this
 *  and calls the same tools (see ./tools.ts) via tool-use. */
export interface Agent { respond(req: AgentRequest): Promise<AgentResponse> }
