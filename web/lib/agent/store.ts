// One cache for every expensive call (Qloo, OSM, Wikipedia, search, live cities).
// Production: Vercel Blob, shared by all serverless instances and by local runs, so a test run warms the demo.
// Without BLOB_READ_WRITE_TOKEN: files under web/.cache/twin. A small in-memory layer sits in front of both.
import { get, list, put } from "@vercel/blob";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const PREFIX = "twin/";
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const diskRoot = () => join(process.env.TWIN_WEB_ROOT ?? process.cwd(), ".cache", "twin");

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
    if (blobOn()) {
      const r = await get(PREFIX + key, { access: "public", useCache: !o.fresh });
      if (r?.statusCode === 200 && r.stream) v = JSON.parse(await new Response(r.stream).text()) as T;
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
    if (blobOn()) {
      await put(PREFIX + key, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
    } else {
      const f = join(diskRoot(), key);
      await mkdir(dirname(f), { recursive: true });
      await writeFile(f, body);
    }
  } catch { /* cache writes are best effort */ }
}

/** Keys under a prefix (e.g. "cities/"), relative to the store root. */
export async function storeList(prefix: string): Promise<string[]> {
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

export const storeBackend = () => (blobOn() ? "vercel-blob" : "disk");
