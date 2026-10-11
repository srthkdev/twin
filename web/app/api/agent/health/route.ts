import { NextResponse } from "next/server";
import { codexHealth } from "@/lib/agent/codex";
import { qlooConfigured } from "@/lib/agent/qloo";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const codex = codexHealth();
  return NextResponse.json({
    codex,
    qloo: { configured: qlooConfigured() },
    defaults: { anthropic: DEFAULT_ANTHROPIC_MODEL, openai: DEFAULT_OPENAI_MODEL },
  });
}
