import { NextResponse } from "next/server";
import type { Report } from "@/lib/agent/report-types";
import { storeGet } from "@/lib/agent/store";
import { renderReportPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return NextResponse.json({ error: "report not found" }, { status: 404 });
  const report = await storeGet<Report>(`reports/${id}.json`);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  const pdf = await renderReportPdf(report);
  const slug = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "twin-report";
  return new Response(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${slug}.pdf"`,
    "Cache-Control": "public, s-maxage=3600",
  } });
}
