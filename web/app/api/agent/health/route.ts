import { NextResponse } from "next/server";
import { qlooConfigured } from "@/lib/agent/qloo";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL, OPENROUTER_MODELS } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    openrouter: { available: !!process.env.OPENROUTER_API_KEY, models: OPENROUTER_MODELS },
    qloo: { configured: qlooConfigured() },
    defaults: { anthropic: DEFAULT_ANTHROPIC_MODEL, openai: DEFAULT_OPENAI_MODEL },
  });
}
