import { NextResponse } from "next/server";
import { allCities, ensureCity } from "@/lib/agent/city-live";
import { newStats, qlooConfigured } from "@/lib/agent/qloo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/cities -> { cities: City[] } (static + cached live). */
export async function GET() {
  return NextResponse.json({ cities: await allCities() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/cities { name } -> text/event-stream:
 *   {type:"progress", stage, done, total, note} ... then {type:"done", city} or {type:"error", message}.
 * Cached cities return `done` immediately.
 */
const WINDOW_MS = 10 * 60_000, MAX_NEW = 6;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  let name = "";
  try { name = String(((await req.json()) as { name?: unknown }).name ?? "").trim().slice(0, 120); } catch { /* handled below */ }
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (o: unknown) => { if (!closed) { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { closed = true; } } };
      try {
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
        const known = (await allCities()).some((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!known) {
          if (!qlooConfigured()) throw new Error("Qloo is not configured on this server.");
          const now = Date.now(), h = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
          if (h.length >= MAX_NEW) throw new Error("City limit reached (6 new cities per 10 minutes).");
          h.push(now); hits.set(ip, h);
        }
        const stats = newStats();
        const city = await ensureCity(name, { stats, onProgress: (p) => send({ type: "progress", ...p }) });
        send({ type: "done", city, qloo: stats });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.slice(0, 300) : "failed to add city" });
      } finally {
        closed = true;
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
