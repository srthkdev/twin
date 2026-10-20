// Types matching /CONTRACT.md exactly.
export type BasketKind = "artist" | "brand" | "movie" | "tv" | "book" | "place-tag" | "podcast";
export type BasketGroup = "music" | "fashion" | "food" | "nightlife" | "film" | "culture" | "lifestyle" | "sport";

export interface Meta {
  generatedAt: string;
  method: string;
  radiusKm: number;
  basketSize: number;
  qlooCalls: number;
  cities: string[];
}
export interface BasketItem { i: number; id: string; label: string; kind: BasketKind; group: BasketGroup }
export interface City {
  id: string; name: string; country: string; center: [number, number]; zoom: number; cellCount: number; hoodCount: number;
  source?: "static" | "live"; dims?: 116 | 40; coverage?: { cells: number; sparseItems: number };
}
/** Core-basket fingerprint file: /data/core/{id}.json (static) or /api/cities/{id}/core (any city). */
export interface CoreFile {
  city?: string; items: string[];
  cells: { g: string; lon: number; lat: number; v: number[] }[];
  hoods: { id: string; name: string; lon: number; lat: number; v: number[] }[];
}
export interface OpportunityCell { g: string; lon: number; lat: number; demand: number; supply: number; score: number }
export interface OpportunityResult { city: string; cells: OpportunityCell[] }
export interface Cell { g: string; lon: number; lat: number; d: number; v: number[]; top: number[] }
export interface CellsFile { city: string; cells: Cell[] }
export interface Hood {
  id: string; city: string; name: string; lon: number; lat: number; cells: number; v: number[]; top: number[]; blurb?: string;
}
export interface SharedDim { i: number; a: number; b: number }
export interface TwinMatch { hood: string; score: number; shared: SharedDim[]; diverge: SharedDim[] }
export type TwinsFile = Record<string, Record<string, TwinMatch[]>>;

export type MethodKey = "twin" | "raw" | "llm" | "random";
export interface MethodStats { label: string; hit1: number; hit3: number; mrr: number; n: number }
export interface EvalPair {
  a: string; b: string; split: "dev" | "test"; source: string; quote: string; rank: Record<MethodKey, number>;
}
export interface Evals {
  generatedAt: string;
  split: { dev: number; test: number };
  methods: Record<MethodKey, MethodStats>;
  pairs: EvalPair[];
  basketSweep: { size: number; mrr: number }[];
  radiusSweep: { km: number; mrr: number }[];
  sanity: { city: string; hood: string; item: string; pct: number; raw_pct: number }[];
  rawCollapse: { twin_mean_cos_spread: number; raw_mean_cos_spread: number; twin_mean_cos?: number; raw_mean_cos?: number };
  census?: Census;
}

export interface CensusRow {
  city: string; label: string; items: string[]; variable: string; expected: "+" | "-";
  rhoCorrected: number; ciCorrected: [number, number]; rhoRaw: number; ciRaw: [number, number]; rhoDensity: number; n: number; id?: string;
}
export interface Census {
  acsYear: number; cities: string[]; preregisteredCommit: string;
  summary: { n: number; correctSignCorrected: number; correctSignRaw: number; correctedBeatsRaw: number; meanAbsRhoCorrected: number; meanAbsRhoRaw: number; [k: string]: number };
  rows: CensusRow[];
  scatter: Record<string, [number, number, number][]>;
}

/** Packed cells for fast loops. */
export interface PackedCells {
  city: string;
  n: number;
  dim: number;
  lon: Float32Array;
  lat: Float32Array;
  d: Float32Array;
  v: Float32Array; // n*dim
  norm: Float32Array;
  g: string[];
  top: number[][];
}

export interface DataSet {
  basket: BasketItem[];
  cities: City[];
  hoods: Hood[];
  twins: TwinsFile;
  /** Labels for the 40 core dims used by live cities and any pair that includes one. */
  coreBasket?: BasketItem[];
}
