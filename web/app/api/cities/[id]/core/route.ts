import { NextResponse } from "next/server";
import { loadCoreText } from "@/lib/agent/city-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cities/{id}/core -> { city, items, cells:[{g,lon,lat,b,v}], hoods:[{id,name,lon,lat,v}] } for static and live cities. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const text = await loadCoreText(id);
  if (!text) return NextResponse.json({ error: `unknown city ${id}` }, { status: 404 });
  return new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
