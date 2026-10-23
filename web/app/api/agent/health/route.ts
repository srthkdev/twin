import { NextResponse } from "next/server";
import { qlooConfigured } from "@/lib/agent/qloo";
import { OPENROUTER_MODELS, usableKeys } from "@/lib/agent/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ openrouter: { available: usableKeys().length > 0, models: OPENROUTER_MODELS }, qloo: { configured: qlooConfigured() } });
}
