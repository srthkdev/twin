import { NextResponse } from "next/server";
import { storeGet, storePut } from "@/lib/agent/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which source → target pairs people actually open, counted from real visits (no seed data).
type Counts = Record<string, number>;
const KEY = "stats/pairs.json";
const ID = /^[a-z0-9-]{2,80}$/;

export async function GET() {
  const c = (await storeGet<Counts>(KEY)) ?? {};
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => { const [from, to] = k.split(">"); return { from, to, n }; });
  return NextResponse.json({ top }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { from?: string; to?: string } | null;
  if (!b?.from || !b.to || !ID.test(b.from) || !ID.test(b.to) || b.from === b.to) return NextResponse.json({ ok: false }, { status: 400 });
  const c = (await storeGet<Counts>(KEY, { fresh: true })) ?? {};
  const k = `${b.from}>${b.to}`;
  c[k] = (c[k] ?? 0) + 1;
  // keep the file small: drop the long tail
  const kept = Object.fromEntries(Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 200));
  await storePut(KEY, kept);
  return NextResponse.json({ ok: true });
}
