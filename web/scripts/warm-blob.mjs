// Upload local caches to the shared Blob store so production starts warm. Skips keys already in Blob.
// usage: node --env-file=.env.local scripts/warm-blob.mjs
import { list, put } from "@vercel/blob";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const walk = async (d) => {
  let ents = [];
  try { ents = await readdir(d, { withFileTypes: true }); } catch { return []; }
  return (await Promise.all(ents.map((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])))).flat();
};
const have = new Set();
for (let cursor; ;) {
  const r = await list({ prefix: "twin/", cursor, limit: 1000 });
  r.blobs.forEach((b) => have.add(b.pathname));
  if (!r.hasMore) break;
  cursor = r.cursor;
}
const jobs = [];
const disk = join(process.cwd(), ".cache", "twin");
for (const f of await walk(disk)) jobs.push(["twin/" + relative(disk, f), f]);
const qtmp = join(tmpdir(), "twin-qloo-cache");
for (const f of await walk(qtmp)) jobs.push(["twin/qloo/" + relative(qtmp, f), f]);
const todo = jobs.filter(([k]) => !have.has(k));
console.log(`${jobs.length} local files, ${todo.length} to upload`);
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  for (;;) {
    const j = todo[i++];
    if (!j) return;
    await put(j[0], await readFile(j[1]), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
  }
}));
console.log("done");
