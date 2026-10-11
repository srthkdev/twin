import { NextResponse } from "next/server";
import { createRuleAgent } from "@/lib/agent/respond";
import { loadServerDataSet } from "@/lib/agent/server-data";
import type { AgentRequest } from "@/lib/agent/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) return NextResponse.json({ error: "messages required" }, { status: 400 });
  const ds = await loadServerDataSet();
  // Drop-in point: replace createRuleAgent with an LLM-backed Agent that calls lib/agent/tools.
  const agent = createRuleAgent(ds);
  return NextResponse.json(await agent.respond(body));
}
