import { NextResponse } from "next/server";
import { z } from "zod";
import { OPENROUTER_MODELS, cappedOn, isDailyCap, usableKeys, utcDay } from "@/lib/agent/ai";
import { missedReportPlaces, runBaseline } from "@/lib/agent/baseline";
import type { BaselineComparison } from "@/lib/agent/baseline";
import type { Report } from "@/lib/agent/report-types";
import { reportPlaces as collectReportPlaces } from "@/lib/agent/report";
import { loadServerDataSet } from "@/lib/agent/server-data";
import { storeGet } from "@/lib/agent/store";
import { reportBlocks } from "@/lib/report/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(4000),
  reportId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  model: z.string().max(180).optional(),
});
const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return false;
  if (hits.size >= 2000 && !hits.has(ip)) for (const [key, times] of hits) if (now - times[times.length - 1] >= WINDOW_MS) hits.delete(key);
  if (hits.size >= 2000 && !hits.has(ip)) hits.delete(hits.keys().next().value!);
  hits.set(ip, [...recent, now]);
  return true;
}
const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  let input: unknown;
  try { input = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400, headers }); }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "A question of 1–4000 characters, a valid report ID and a supported model are required." }, { status: 400, headers });
  const { question, reportId } = parsed.data;
  const primary = parsed.data.model && OPENROUTER_MODELS.includes(parsed.data.model) ? parsed.data.model : OPENROUTER_MODELS[0];
  try {
    const report = reportId ? await storeGet<Report>(`reports/${reportId}.json`) : null;
    if (reportId && !report) return NextResponse.json({ error: "report not found" }, { status: 404, headers });
    const userKey = req.headers.get("x-agent-key")?.trim();
    const keys = userKey ? [userKey] : usableKeys();
    if (!keys.length) return NextResponse.json({ error: "No OpenRouter key on the server — add your own in agent settings." }, { status: 400, headers });
    if (!userKey) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
      if (!allow(ip)) return NextResponse.json({ error: "Demo limit reached (20 comparisons per 10 minutes). Add your own OpenRouter key in settings to keep going." }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
    }
    const ds = await loadServerDataSet();
    // next server key when one has used its free daily requests
    let baseline: Awaited<ReturnType<typeof runBaseline>> | undefined, lastError: unknown;
    for (const key of keys) {
      try { baseline = await runBaseline(question, primary, key, ds, req.signal); break; }
      catch (e) { lastError = e; if (!userKey && isDailyCap(String((e as Error)?.message ?? e))) cappedOn.set(key, utcDay()); else break; }
    }
    if (!baseline) throw lastError;
    const reportPlaces = report ? report.places ?? collectReportPlaces(reportBlocks(report)) : [];
    const result: BaselineComparison = { ...baseline, ...(reportId ? { reportId } : {}), reportPlaces, missedPlaces: missedReportPlaces(baseline.places, reportPlaces, ds) };
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "The comparison could not finish right now. Try again." }, { status: 502, headers });
  }
}
