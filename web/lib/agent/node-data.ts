// Node-side data loader (no "server-only" so the MCP server can reuse it under tsx).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CellsFile, DataSet } from "../types";
import basketKeys from "./data/basket-keys.json";

export const BASKET_KEYS = basketKeys as Record<string, { key: string; val: string }>;

function root() {
  const base = process.env.TWIN_WEB_ROOT ?? process.cwd();
  return join(base, "public");
}
const dataDir = () => "data";

let dsP: Promise<DataSet> | null = null;
export function loadDataSet(): Promise<DataSet> {
  if (!dsP) {
    dsP = (async () => {
      const dir = join(root(), dataDir());
      const rd = async <T,>(f: string) => JSON.parse(await readFile(join(dir, f), "utf8")) as T;
      const [basket, cities, hoods, twins] = await Promise.all([
        rd<DataSet["basket"]>("basket.json"), rd<DataSet["cities"]>("cities.json"), rd<DataSet["hoods"]>("hoods.json"), rd<DataSet["twins"]>("twins.json"),
      ]);
      return { basket, cities, hoods, twins };
    })();
    dsP.catch(() => { dsP = null; });
  }
  return dsP;
}

const cellCache = new Map<string, Promise<CellsFile>>();
export function loadCellsFile(city: string): Promise<CellsFile> {
  let p = cellCache.get(city);
  if (!p) {
    p = readFile(join(root(), dataDir(), "cells", `${city}.json`), "utf8").then((s) => JSON.parse(s) as CellsFile);
    p.catch(() => cellCache.delete(city));
    cellCache.set(city, p);
  }
  return p;
}
