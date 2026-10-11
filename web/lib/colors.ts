export type RGBA = [number, number, number, number];
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);

const TWIN_STOPS: [number, number[]][] = [
  [0, [28, 24, 70]], [0.35, [88, 56, 214]], [0.62, [176, 84, 247]], [0.82, [34, 211, 238]], [1, [236, 254, 255]],
];
const RAW_STOPS: [number, number[]][] = [
  [0, [60, 28, 12]], [0.4, [154, 62, 14]], [0.7, [249, 115, 22]], [1, [253, 230, 138]],
];
const SRC_STOPS: [number, number[]][] = [
  [0, [20, 20, 40]], [0.5, [60, 50, 140]], [1, [167, 139, 250]],
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
export type PaletteName = "twin" | "raw" | "src";
export function colorAt(p: PaletteName, t: number): RGBA {
  const c = ramp(p === "twin" ? TWIN_STOPS : p === "raw" ? RAW_STOPS : SRC_STOPS, t);
  return [c[0], c[1], c[2], Math.round(55 + 200 * Math.min(1, t * 1.25))];
}
export function gradientCss(p: PaletteName) {
  const stops = Array.from({ length: 8 }, (_, i) => { const c = colorAt(p, i / 7); return `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`; });
  return `linear-gradient(90deg, ${stops.join(",")})`;
}
