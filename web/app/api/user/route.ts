import { NextResponse } from "next/server";
import { NAME_RE, claimName, nameTaken, normalName, readHistory, verify, writeHistory, type UserHistory } from "@/lib/user-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000;
const auth = (req: Request) => verify(normalName(req.headers.get("x-twin-user")), req.headers.get("x-twin-code") ?? "");

/** POST { name } claims a username and returns its sync code; POST { name, code } signs in on another device. */
export async function POST(req: Request) {
  let body: { name?: unknown; code?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const name = normalName(body.name);
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Use 3–24 letters, numbers, - or _." }, { status: 400 });
  if (typeof body.code === "string" && body.code) {
    const key = await verify(name, body.code.trim());
    if (!key) return NextResponse.json({ error: "That name and sync code don't match." }, { status: 401 });
    return NextResponse.json({ name, history: await readHistory(key) });
  }
  const r = await claimName(name);
  if ("taken" in r) return NextResponse.json({ error: "That name is taken. If it's yours, enter its sync code." }, { status: 409 });
  return NextResponse.json({ name, code: r.code });
}

/** GET ?check=<name> → { available }; otherwise the signed-in user's history. */
export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.get("check");
  if (check !== null) {
    const name = normalName(check);
    if (!NAME_RE.test(name)) return NextResponse.json({ available: false, error: "Use 3–24 letters, numbers, - or _." });
    return NextResponse.json({ available: !(await nameTaken(name)) }, { headers: { "Cache-Control": "no-store" } });
  }
  const key = await auth(req);
  if (!key) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json(await readHistory(key), { headers: { "Cache-Control": "no-store" } });
}

/** PUT history → replaces the signed-in user's history (chats + reports, capped). */
export async function PUT(req: Request) {
  const key = await auth(req);
  if (!key) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "history too large" }, { status: 413 });
  let h: UserHistory;
  try { h = JSON.parse(raw) as UserHistory; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (!Array.isArray(h.chats) || !Array.isArray(h.reports)) return NextResponse.json({ error: "invalid history" }, { status: 400 });
  await writeHistory(key, { chats: h.chats.slice(0, 10), reports: h.reports.slice(0, 50) });
  return NextResponse.json({ ok: true });
}
