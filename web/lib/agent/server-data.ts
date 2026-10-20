import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DataSet } from "../types";

let cached: Promise<DataSet> | null = null;
/** Server-side loader for the precomputed pipeline output in /public/data. */
export function loadServerDataSet(): Promise<DataSet> {
  if (!cached) {
    cached = (async () => {
      const root = join(process.cwd(), "public");
      const dir = "data";
      const rd = async <T,>(f: string) => JSON.parse(await readFile(join(root, dir, f), "utf8")) as T;
      const [basket, cities, hoods, twins] = await Promise.all([rd<DataSet["basket"]>("basket.json"), rd<DataSet["cities"]>("cities.json"), rd<DataSet["hoods"]>("hoods.json"), rd<DataSet["twins"]>("twins.json")]);
      return { basket, cities, hoods, twins };
    })();
    cached.catch(() => { cached = null; });
  }
  return cached;
}
