export type RGBA = [number, number, number, number];
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);

// Corrected similarity: warm dark → amber → bone. Raw density: greys only, so "raw" never looks like signal.
const TWIN_STOPS: [number, number[]][] = [
  [0, [34, 32, 28]], [0.45, [92, 70, 40]], [0.72, [200, 128, 46]], [0.9, [240, 160, 60]], [1, [246, 232, 205]],
];
const RAW_STOPS: [number, number[]][] = [
  [0, [30, 30, 28]], [0.5, [80, 78, 72]], [1, [170, 166, 156]],
];
const SRC_STOPS: [number, number[]][] = [
  [0, [26, 26, 24]], [0.6, [70, 68, 62]], [1, [150, 146, 136]],
];

// Opportunity: grey until the score is high, then amber.
const OPP_STOPS: [number, number[]][] = [
  [0, [34, 34, 31]], [0.55, [110, 107, 99]], [0.6, [190, 124, 46]], [1, [240, 160, 60]],
];

function ramp(stops: [number, number[]][], t: number) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}
export type PaletteName = "twin" | "raw" | "src" | "opp";
export function colorAt(p: PaletteName, t: number): RGBA {
  const c = ramp(p === "twin" ? TWIN_STOPS : p === "raw" ? RAW_STOPS : p === "opp" ? OPP_STOPS : SRC_STOPS, t);
  return [c[0], c[1], c[2], Math.round(70 + 185 * Math.min(1, t * 1.2))];
}
export function gradientCss(p: PaletteName) {
  const stops = Array.from({ length: 8 }, (_, i) => { const c = colorAt(p, i / 7); return `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`; });
  return `linear-gradient(90deg, ${stops.join(",")})`;
}
/** Text ramp for legends: the same scale as characters. */
export const SHADE = " ░▒▓█";
