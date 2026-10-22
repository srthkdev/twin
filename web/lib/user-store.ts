// Lightweight accounts without passwords: a username plus a sync code issued when the name is claimed.
// The claim record keeps only a hash of the code; the history lives at a path derived from that hash, so a
// name alone can neither read nor overwrite anyone's history.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { storeCreate, storeGet, storePut } from "./agent/store";

export const NAME_RE = /^[a-z0-9_-]{3,24}$/;
export interface UserHistory { chats: unknown[]; reports: { id: string; title: string; at: number }[] }
interface Claim { name: string; codeHash: string; createdAt: string }

const hash = (code: string) => createHash("sha256").update(code).digest("hex");
const claimKey = (name: string) => `users/${name}.json`;
const historyKey = (name: string, codeHash: string) => `users/${name}-${codeHash.slice(0, 24)}/history.json`;

export const normalName = (raw: unknown) => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

/** Claim a free name; returns the sync code once (only its hash is stored). */
export async function claimName(name: string): Promise<{ code: string } | { taken: true }> {
  const code = randomBytes(9).toString("base64url");
  // create-only: of two simultaneous claims exactly one succeeds
  if (!(await storeCreate(claimKey(name), { name, codeHash: hash(code), createdAt: new Date().toISOString() } satisfies Claim))) return { taken: true };
  await storePut(historyKey(name, hash(code)), { chats: [], reports: [] } satisfies UserHistory);
  return { code };
}

export const nameTaken = async (name: string) => !!(await storeGet<Claim>(claimKey(name), { fresh: true }));

/** The history key for a valid name + code, or null. */
export async function verify(name: string, code: string): Promise<string | null> {
  if (!NAME_RE.test(name) || !code) return null;
  const claim = await storeGet<Claim>(claimKey(name), { fresh: true });
  if (!claim) return null;
  const a = Buffer.from(claim.codeHash), b = Buffer.from(hash(code));
  return a.length === b.length && timingSafeEqual(a, b) ? historyKey(name, claim.codeHash) : null;
}

export const readHistory = async (key: string) => (await storeGet<UserHistory>(key, { fresh: true })) ?? { chats: [], reports: [] };
export const writeHistory = (key: string, h: UserHistory) => storePut(key, h);

/** Add a finished report to a user's history (server side, so it lands there even if the tab was closed). */
export async function appendReport(name: string, code: string, report: { id: string; title: string; at: number }) {
  const key = await verify(name, code);
  if (!key) return;
  const h = await readHistory(key);
  await writeHistory(key, { ...h, reports: [report, ...h.reports.filter((r) => r.id !== report.id)].slice(0, 50) });
}
