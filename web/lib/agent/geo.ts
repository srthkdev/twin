export const hav = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000, p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";
export function geohash(lat: number, lon: number, precision = 6): string {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180, bit = 0, ch = 0, even = true, out = "";
  while (out.length < precision) {
    if (even) { const m = (lonLo + lonHi) / 2; if (lon >= m) { ch = (ch << 1) | 1; lonLo = m; } else { ch <<= 1; lonHi = m; } }
    else { const m = (latLo + latHi) / 2; if (lat >= m) { ch = (ch << 1) | 1; latLo = m; } else { ch <<= 1; latHi = m; } }
    even = !even;
    if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
  }
  return out;
}

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
}

/** Centre of a geohash cell as [lat, lon]. */
export function geohashCenter(g: string): [number, number] {
  let even = true, lat = [-90, 90], lon = [-180, 180];
  for (const ch of g) {
    const v = B32.indexOf(ch);
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1, r = even ? lon : lat, m = (r[0] + r[1]) / 2;
      if (bit) r[0] = m; else r[1] = m;
      even = !even;
    }
  }
  return [(lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2];
}
