// One cache for every expensive call (Qloo, OSM, Wikipedia, search, live cities), plus reports and usernames.
// Production: Upstash Redis, shared by all serverless instances and by local runs, so a test run warms the demo.
// Vercel Blob is the older backend (still read if it is the only one set). Without either: files under web/.cache/twin.
// A small in-memory layer sits in front of all of them.
import { get, list, put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const PREFIX = "twin/";
const redisUrl = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
let client: Redis | null = null;
const redis = () => (client ??= redisUrl() && redisToken() ? new Redis({ url: redisUrl()!, token: redisToken()!, retry: { retries: 1 } }) : null);
const blobOn = () => !redis() && !!process.env.BLOB_READ_WRITE_TOKEN;
const diskRoot = () => join(process.env.TWIN_WEB_ROOT ?? process.cwd(), ".cache", "twin");

/** Blob calls must never hold up an answer: a slow read counts as a miss, a slow write is dropped. */
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("store timeout")), ms))]);

const MEM_MAX = 600;
const mem = new Map<string, unknown>();
const remember = (k: string, v: unknown) => {
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value!);
  mem.set(k, v);
};

/** Read a JSON value. `fresh` bypasses the in-memory layer and the Blob CDN (for small mutable indexes). */
export async function storeGet<T>(key: string, o: { fresh?: boolean } = {}): Promise<T | null> {
  if (!o.fresh && mem.has(key)) return mem.get(key) as T;
  let v: T | null = null;
  try {
    const r = redis();
    if (r) v = await within(r.get<T>(PREFIX + key), 8000);
    else if (blobOn()) {
      v = await within((async () => {
        const r = await get(PREFIX + key, { access: "public", useCache: !o.fresh });
        return r?.statusCode === 200 && r.stream ? JSON.parse(await new Response(r.stream).text()) as T : null;
      })(), 8000);
    } else {
      v = JSON.parse(await readFile(join(diskRoot(), key), "utf8")) as T;
    }
  } catch { v = null; }
  if (v !== null) remember(key, v);
  return v;
}

export async function storePut(key: string, data: unknown): Promise<void> {
  remember(key, data);
  const body = JSON.stringify(data);
  try {
    const r = redis();
    if (r) await within(r.set(PREFIX + key, body), 10000);
    else if (blobOn()) {
      await within(put(PREFIX + key, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 }), 10000);
    } else {
      const f = join(diskRoot(), key);
      await mkdir(dirname(f), { recursive: true });
      await writeFile(f, body);
    }
  } catch { /* cache writes are best effort */ }
}

/** Create-only write: true if this call created the key, false if it already existed (atomic on Blob). */
export async function storeCreate(key: string, data: unknown): Promise<boolean> {
  const body = JSON.stringify(data);
  try {
    const r = redis();
    if (r) { if ((await within(r.set(PREFIX + key, body, { nx: true }), 10000)) !== "OK") return false; }
    else if (blobOn()) await within(put(PREFIX + key, body, { access: "public", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" }), 10000);
    else { const f = join(diskRoot(), key); await mkdir(dirname(f), { recursive: true }); await writeFile(f, body, { flag: "wx" }); }
  } catch { return false; }
  remember(key, data);
  return true;
}

/** Keys under a prefix (e.g. "cities/"), relative to the store root. */
export async function storeList(prefix: string): Promise<string[]> {
  const r = redis();
  if (r) {
    const out: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await within(r.scan(cursor, { match: `${PREFIX}${prefix}*`, count: 1000 }), 8000);
      out.push(...keys.map((k) => k.slice(PREFIX.length)));
      cursor = String(next);
    } while (cursor !== "0");
    return out;
  }
  if (blobOn()) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix: PREFIX + prefix, cursor, limit: 1000 });
      out.push(...r.blobs.map((b) => b.pathname.slice(PREFIX.length)));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const root = join(diskRoot(), prefix);
  const walk = async (d: string): Promise<string[]> => {
    let ents: { name: string; isDirectory(): boolean }[] = [];
    try { ents = await readdir(d, { withFileTypes: true }); } catch { return []; }
    const nested = await Promise.all(ents.map((e) => (e.isDirectory() ? walk(join(d, e.name)) : Promise.resolve([join(d, e.name)]))));
    return nested.flat();
  };
  return (await walk(root)).map((f) => relative(diskRoot(), f));
}

/** Cached call: returns the stored value if younger than ttl, else runs fn and stores its result (errors are not cached). */
export async function storeCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = await storeGet<{ t: number; d: T }>(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.d;
  const d = await fn();
  await storePut(key, { t: Date.now(), d });
  return d;
}

export const storeBackend = () => (redis() ? "upstash-redis" : blobOn() ? "vercel-blob" : "disk");
