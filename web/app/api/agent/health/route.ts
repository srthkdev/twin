import { NextResponse } from "next/server";
import { qlooConfigured } from "@/lib/agent/qloo";
import { GEMINI_MODEL, OPENROUTER_MODELS, usableKeys } from "@/lib/agent/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // models in the order the agent tries them: Gemini first when its key is set
  const gemini = !!process.env.GEMINI_API_KEY?.trim();
  return NextResponse.json({ openrouter: { available: gemini || usableKeys().length > 0, models: [...(gemini ? [`google/${GEMINI_MODEL}`] : []), ...OPENROUTER_MODELS] }, qloo: { configured: qlooConfigured() } });
}
