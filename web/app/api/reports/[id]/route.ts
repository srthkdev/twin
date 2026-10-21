import { NextResponse } from "next/server";
import type { Report } from "@/lib/agent/report-types";
import { storeGet } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "public, s-maxage=3600" };

/** GET /api/reports/{id} -> a stored Twin report. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return NextResponse.json({ error: "report not found" }, { status: 404, headers });
  const report = await storeGet<Report>(`reports/${id}.json`);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404, headers });
  return NextResponse.json(report, { headers });
}
