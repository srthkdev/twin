#!/usr/bin/env node
// Mock data generator for Twin. Writes contract-conforming data to web/public/data-mock/.
// NEVER writes to web/public/data/ (owned by the real pipeline).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data-mock");
mkdirSync(join(OUT, "cells"), { recursive: true });

// ---------- rng ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261011);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- geohash ----------
const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function geohash(lat, lon, precision = 6) {
  let latR = [-90, 90], lonR = [-180, 180], bit = 0, ch = 0, even = true, out = "";
  while (out.length < precision) {
    const r = even ? lonR : latR, v = even ? lon : lat, mid = (r[0] + r[1]) / 2;
    if (v > mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
    even = !even;
    if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
  }
  return out;
}

// ---------- basket ----------
// label | kind | group | archetypes it is boosted in
const BASKET_SRC = `
Tame Impala|artist|music|indie
Phoebe Bridgers|artist|music|indie
Frank Ocean|artist|music|indie,hiphop
Mac DeMarco|artist|music|indie
Radiohead|artist|music|indie,rock
Beach House|artist|music|indie
Vinyl record stores|place-tag|culture|indie,bohemian
Aesop|brand|fashion|indie,luxury
Natural wine bars|place-tag|nightlife|indie,fashion
Specialty coffee|place-tag|food|indie,wellness
A24|brand|film|indie,art
Peggy Gou|artist|music|electronic,indie
Fred again..|artist|music|electronic
Four Tet|artist|music|electronic
Bonobo|artist|music|electronic,wellness
Techno clubs|place-tag|nightlife|electronic
Boiler Room|brand|music|electronic,fashion
Rick Owens|brand|fashion|electronic,fashion
Louis Vuitton|brand|fashion|luxury,tourist
Chanel|brand|fashion|luxury
Hermès|brand|fashion|luxury
Rolex|brand|lifestyle|luxury,corporate
Gucci|brand|fashion|luxury,tourist
Michelin-starred dining|place-tag|food|luxury
Art galleries|place-tag|culture|luxury,art
Bad Bunny|artist|music|latin
Peso Pluma|artist|music|latin
Karol G|artist|music|latin
Rosalía|artist|music|latin,fashion
Taquerías|place-tag|food|latin
Reggaeton|place-tag|music|latin,club
Kendrick Lamar|artist|music|hiphop
Drake|artist|music|hiphop,club
Travis Scott|artist|music|hiphop
Jay-Z|artist|music|hiphop
Stormzy|artist|music|hiphop
Nike|brand|fashion|hiphop,suburban
Jordan Brand|brand|fashion|hiphop
Barbershops|place-tag|lifestyle|hiphop,latin
Dua Lipa|artist|music|club,student
The Weeknd|artist|music|club
Calvin Harris|artist|music|club
Lady Gaga|artist|music|club
Rooftop bars|place-tag|nightlife|club,tourist
Cocktail bars|place-tag|nightlife|club,fashion
Zara|brand|fashion|club,tourist,student
Taylor Swift|artist|music|suburban,student
Morgan Wallen|artist|music|suburban
Coldplay|artist|music|suburban,tourist
Ed Sheeran|artist|music|suburban,student
IKEA|brand|lifestyle|suburban,student
Starbucks|brand|food|suburban,tourist,corporate
Marvel Cinematic Universe|movie|film|suburban,student
Family restaurants|place-tag|food|suburban
Yoga studios|place-tag|lifestyle|wellness
Lululemon|brand|fashion|wellness,suburban
Vegan restaurants|place-tag|food|wellness,kpop
Patagonia|brand|fashion|wellness,indie
Matcha cafés|place-tag|food|wellness,kpop
BTS|artist|music|kpop
BLACKPINK|artist|music|kpop
NewJeans|artist|music|kpop
Korean BBQ|place-tag|food|kpop
Squid Game|tv|film|kpop
Boba tea|place-tag|food|kpop,student
Studio Ghibli|movie|film|kpop,art
Anime|tv|film|kpop,student
Björk|artist|music|art,indie
Museums|place-tag|culture|art,tourist
Kubrick|movie|film|art
Haruki Murakami|book|culture|art,bohemian
Independent bookshops|place-tag|culture|art,bohemian
Arthouse cinemas|place-tag|film|art
MUBI|brand|film|art,indie
Harry Styles|artist|music|student
Olivia Rodrigo|artist|music|student
Ramen shops|place-tag|food|student,kpop
H&M|brand|fashion|student,tourist
Netflix|brand|film|student,corporate
Pubs|place-tag|nightlife|student,rock
Disney|brand|film|tourist
Beyoncé|artist|music|tourist,hiphop
Leonard Cohen|artist|music|bohemian
Bob Dylan|artist|music|bohemian,rock
Jazz clubs|place-tag|nightlife|bohemian,art
Vintage clothing|place-tag|fashion|bohemian,fashion,indie
Comme des Garçons|brand|fashion|fashion,art
Maison Margiela|brand|fashion|fashion,luxury
Acne Studios|brand|fashion|fashion,indie
Carhartt WIP|brand|fashion|fashion,hiphop
The Smiths|artist|music|rock
Oasis|artist|music|rock,suburban
Arctic Monkeys|artist|music|rock,student
Joy Division|artist|music|rock,indie
Live music venues|place-tag|nightlife|rock,indie
Tesla|brand|lifestyle|corporate
Apple|brand|lifestyle|corporate
Sweetgreen|brand|food|corporate,wellness
Financial Times|book|culture|corporate
Acquired podcast|podcast|culture|corporate
`.trim().split("\n");
const BASKET = BASKET_SRC.map((l, i) => {
  const [label, kind, group, arch] = l.split("|");
  return { i, id: `${kind}-${slug(label)}`, label, kind, group, arch: arch.split(",") };
});
if (BASKET.length !== 100) throw new Error("basket size " + BASKET.length);
const N = BASKET.length;

const ARCHS = ["indie","electronic","luxury","latin","hiphop","club","suburban","wellness","kpop","art","student","tourist","bohemian","fashion","rock","corporate"];
const ARCH_VEC = {};
for (const a of ARCHS) {
  ARCH_VEC[a] = BASKET.map((b) => {
    let x = gauss() * 0.45;
    if (b.arch[0] === a) x += 2.2;
    else if (b.arch.includes(a)) x += 1.3;
    return x;
  });
}
const ARCH_BLURB = {
  indie: "Record-store, natural-wine, thrift-and-tote creative strip",
  electronic: "Club-kid nights, techno basements and late afternoons that start at midnight",
  luxury: "Quiet money: flagship boutiques, tasting menus, and gallery openings",
  latin: "Reggaeton on the street, taquerías on every corner",
  hiphop: "Barbershop culture, sneakers and the sound of a generation",
  club: "Rooftops, velvet ropes and pop anthems after dark",
  suburban: "Family-friendly, chart-topping and comfortably mainstream",
  wellness: "Yoga at sunrise, matcha by noon, vegan everything",
  kpop: "K-pop posters, late-night BBQ and boba on every block",
  art: "Arthouse cinemas, galleries and a bookshop in every alley",
  student: "Cheap ramen, pubs and playlists on repeat",
  tourist: "Landmarks, souvenirs and global brands",
  bohemian: "Jazz clubs, antique markets and old-world troubadours",
  fashion: "Showroom-fresh streetwear and archive designer pieces",
  rock: "Guitar-heavy venues, pubs and a long musical memory",
  corporate: "Glass towers, grain bowls and business podcasts",
};

// ---------- cities ----------
const CITIES = [
  { id: "los-angeles", name: "Los Angeles", country: "United States", center: [-118.32, 34.05], zoom: 9.6, hoods: `
Silver Lake|-118.2700|34.0869|indie|bohemian
Echo Park|-118.2606|34.0782|indie|electronic
Highland Park|-118.1927|34.1118|indie|latin
Eagle Rock|-118.2100|34.1390|indie|student
Los Feliz|-118.2840|34.1067|bohemian|indie
Hollywood|-118.3267|34.0928|tourist|club
West Hollywood|-118.3617|34.0900|club|fashion
Venice|-118.4695|33.9850|wellness|indie
Santa Monica|-118.4912|34.0195|wellness|tourist
Beverly Hills|-118.4004|34.0736|luxury|tourist
Bel Air|-118.4600|34.0900|luxury|suburban
Koreatown|-118.3009|34.0578|kpop|club
Downtown LA|-118.2437|34.0407|art|corporate
Boyle Heights|-118.2086|34.0334|latin|hiphop
East LA|-118.1720|34.0239|latin|suburban
Compton|-118.2201|33.8958|hiphop|latin
Pasadena|-118.1445|34.1478|suburban|art
Encino|-118.5010|34.1590|suburban|luxury
Culver City|-118.3965|34.0211|art|corporate
Westwood|-118.4452|34.0689|student|suburban
Inglewood|-118.3531|33.9617|hiphop|club` },
  { id: "new-york", name: "New York", country: "United States", center: [-73.97, 40.73], zoom: 10.2, hoods: `
Williamsburg|-73.9573|40.7081|indie|fashion
Bushwick|-73.9212|40.6944|electronic|indie
Greenpoint|-73.9515|40.7304|indie|suburban
East Village|-73.9818|40.7265|indie|student
Lower East Side|-73.9842|40.7150|club|indie
SoHo|-74.0014|40.7233|fashion|luxury
Tribeca|-74.0089|40.7163|luxury|wellness
Upper East Side|-73.9590|40.7736|luxury|bohemian
Upper West Side|-73.9750|40.7870|art|suburban
Harlem|-73.9465|40.8116|hiphop|bohemian
Bed-Stuy|-73.9418|40.6872|hiphop|indie
Astoria|-73.9301|40.7644|suburban|student
Flushing|-73.8330|40.7675|kpop|student
South Bronx|-73.9196|40.8165|latin|hiphop
Chelsea|-74.0010|40.7465|club|art
Midtown|-73.9857|40.7549|tourist|corporate
Park Slope|-73.9810|40.6710|wellness|suburban
Jackson Heights|-73.8830|40.7557|latin|student
Washington Heights|-73.9393|40.8417|latin|hiphop
Long Island City|-73.9442|40.7447|art|corporate
Financial District|-74.0090|40.7075|corporate|tourist` },
  { id: "london", name: "London", country: "United Kingdom", center: [-0.1, 51.51], zoom: 10.2, hoods: `
Shoreditch|-0.0780|51.5260|indie|fashion
Hackney|-0.0553|51.5450|indie|electronic
Dalston|-0.0750|51.5460|electronic|indie
Peckham|-0.0690|51.4740|hiphop|indie
Brixton|-0.1145|51.4613|hiphop|bohemian
Camden|-0.1426|51.5390|rock|indie
Notting Hill|-0.2050|51.5090|bohemian|luxury
Mayfair|-0.1480|51.5100|luxury|tourist
Soho|-0.1337|51.5136|club|tourist
Kensington|-0.1900|51.4990|luxury|suburban
Chelsea|-0.1687|51.4875|luxury|suburban
Islington|-0.1030|51.5360|art|suburban
Whitechapel|-0.0610|51.5154|kpop|student
Southwark|-0.0900|51.5040|tourist|art
Greenwich|0.0000|51.4826|suburban|tourist
Wimbledon|-0.2064|51.4214|suburban|wellness
Stratford|-0.0042|51.5416|club|student
Clapham|-0.1380|51.4620|student|club
Canary Wharf|-0.0235|51.5054|corporate|tourist
Walthamstow|-0.0198|51.5830|indie|suburban
Tottenham|-0.0680|51.5880|hiphop|rock
Hampstead|-0.1780|51.5560|bohemian|suburban` },
  { id: "berlin", name: "Berlin", country: "Germany", center: [13.40, 52.5], zoom: 10.3, hoods: `
Neukölln (Reuterkiez)|13.4255|52.4895|indie|electronic
Kreuzberg (SO36)|13.4220|52.5000|electronic|indie
Kreuzberg (Bergmannkiez)|13.3870|52.4890|wellness|bohemian
Friedrichshain|13.4540|52.5120|electronic|indie
Prenzlauer Berg|13.4240|52.5390|wellness|suburban
Mitte|13.4010|52.5200|fashion|tourist
Charlottenburg|13.3040|52.5160|luxury|bohemian
Grunewald|13.2720|52.4930|luxury|suburban
Zehlendorf|13.2590|52.4340|suburban|wellness
Wedding|13.3560|52.5500|hiphop|latin
Schöneberg|13.3580|52.4850|club|bohemian
Tempelhof|13.3850|52.4700|suburban|wellness
Marzahn|13.5640|52.5430|suburban|student
Lichtenberg|13.4990|52.5130|student|rock
Moabit|13.3430|52.5300|art|student
Treptow|13.4640|52.4890|wellness|suburban
Weißensee|13.4640|52.5500|suburban|art
Spandau|13.2000|52.5350|suburban|rock
Gesundbrunnen|13.3880|52.5550|hiphop|kpop
Alexanderplatz|13.4130|52.5219|tourist|corporate` },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", center: [-99.15, 19.4], zoom: 10.2, hoods: `
Roma Norte|-99.1620|19.4190|indie|art
Condesa|-99.1730|19.4115|wellness|indie
Polanco|-99.1950|19.4330|luxury|fashion
Coyoacán|-99.1620|19.3500|bohemian|art
Centro Histórico|-99.1330|19.4326|tourist|latin
Juárez|-99.1650|19.4270|club|art
San Ángel|-99.1900|19.3470|bohemian|luxury
Santa Fe|-99.2600|19.3600|corporate|luxury
Tepito|-99.1250|19.4450|latin|hiphop
Iztapalapa|-99.0600|19.3550|latin|suburban
Xochimilco|-99.1050|19.2600|tourist|latin
Narvarte|-99.1550|19.3950|suburban|student
Del Valle|-99.1700|19.3800|suburban|wellness
Doctores|-99.1450|19.4150|hiphop|latin
Escandón|-99.1800|19.4040|indie|electronic
Tlalpan|-99.1700|19.2900|suburban|wellness
Lomas de Chapultepec|-99.2100|19.4250|luxury|corporate
Ciudad Universitaria|-99.1860|19.3320|student|art
Anzures|-99.1800|19.4300|club|fashion
Gustavo A. Madero|-99.1130|19.4830|latin|suburban` },
  { id: "paris", name: "Paris", country: "France", center: [2.35, 48.86], zoom: 11, hoods: `
Le Marais|2.3620|48.8570|fashion|indie
Belleville|2.3850|48.8720|indie|kpop
Montmartre|2.3410|48.8867|tourist|bohemian
Pigalle|2.3370|48.8820|club|rock
Oberkampf|2.3790|48.8650|indie|club
Canal Saint-Martin|2.3640|48.8710|indie|wellness
Quartier Latin|2.3470|48.8500|student|bohemian
Saint-Germain|2.3340|48.8540|luxury|bohemian
Passy|2.2740|48.8570|luxury|suburban
Champs-Élysées|2.3080|48.8700|tourist|luxury
La Défense|2.2380|48.8920|corporate|tourist
Saint-Denis|2.3580|48.9360|hiphop|latin
Château Rouge|2.3500|48.8860|hiphop|latin
Bastille|2.3690|48.8530|club|indie
Chinatown (13e)|2.3620|48.8280|kpop|student
Montparnasse|2.3250|48.8420|suburban|art
Batignolles|2.3190|48.8840|wellness|suburban
Ménilmontant|2.3900|48.8670|electronic|indie
Vincennes|2.4380|48.8470|suburban|wellness
Bagnolet|2.4170|48.8680|hiphop|latin
Pantin|2.4030|48.8940|art|electronic` },
];

// ---------- geometry ----------
const KM_LAT = 111.32;
const kmLon = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
const dist = (lon1, lat1, lon2, lat2) => {
  const dx = (lon1 - lon2) * kmLon((lat1 + lat2) / 2), dy = (lat1 - lat2) * KM_LAT;
  return Math.hypot(dx, dy);
};
const GH_DLON = 360 / Math.pow(2, 15), GH_DLAT = 180 / Math.pow(2, 15); // geohash-6: 30 bits (15/15)

function zscoreCols(rows) {
  for (let k = 0; k < N; k++) {
    let m = 0;
    for (const r of rows) m += r[k];
    m /= rows.length;
    let s = 0;
    for (const r of rows) s += (r[k] - m) ** 2;
    s = Math.sqrt(s / rows.length) || 1;
    for (const r of rows) r[k] = (r[k] - m) / s;
  }
}
const topK = (v, k) => v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map((x) => x[1]);
const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};

const allHoods = [];
const cityOut = [];
for (const c of CITIES) {
  const hoods = c.hoods.trim().split("\n").map((l) => {
    const [name, lon, lat, a1, a2] = l.split("|");
    const base = ARCH_VEC[a1].map((x, i) => 0.7 * x + 0.3 * ARCH_VEC[a2][i]);
    return { name, lon: +lon, lat: +lat, a1, a2, base, id: `${c.id}-${slug(name)}` };
  });
  // cells: geohash-6 grid; keep within 13.5 km of center or within 2 km of any hood
  const [clon, clat] = c.center;
  const cells = [];
  const i0 = Math.floor((clon - 0.5) / GH_DLON), i1 = Math.ceil((clon + 0.5) / GH_DLON);
  const j0 = Math.floor((clat - 0.3) / GH_DLAT), j1 = Math.ceil((clat + 0.3) / GH_DLAT);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const lon = (i + 0.5) * GH_DLON, lat = (j + 0.5) * GH_DLAT;
    const dc = dist(lon, lat, clon, clat);
    let near = 99;
    for (const h of hoods) near = Math.min(near, dist(lon, lat, h.lon, h.lat));
    if (dc <= 13.5 || near <= 2.2) cells.push({ lon, lat, dc, near });
  }
  const rows = cells.map((cell) => {
    let wsum = 0.12;
    const acc = new Array(N).fill(0);
    // weak "mainstream" background
    for (let k = 0; k < N; k++) acc[k] += 0.12 * (ARCH_VEC.suburban[k] * 0.5 + ARCH_VEC.tourist[k] * 0.5);
    for (const h of hoods) {
      const w = Math.exp(-((dist(cell.lon, cell.lat, h.lon, h.lat) / 1.9) ** 2));
      if (w < 0.002) continue;
      wsum += w;
      for (let k = 0; k < N; k++) acc[k] += w * h.base[k];
    }
    return acc.map((x) => x / wsum + gauss() * 0.4);
  });
  zscoreCols(rows);
  const out = cells.map((cell, idx) => {
    const v = rows[idx];
    const d = Math.max(0.04, Math.min(0.99, 0.28 + 0.62 * Math.exp(-cell.dc / 7) + 0.1 * Math.exp(-cell.near / 1.5) + gauss() * 0.03));
    return { g: geohash(cell.lat, cell.lon), lon: r3(cell.lon * 1000) / 1000, lat: r3(cell.lat * 1000) / 1000, d: r3(d), v: v.map(r3), top: topK(v, 3), _v: v, _lonF: cell.lon, _latF: cell.lat };
  });
  // dedupe on geohash (rounding collisions are impossible with exact centers, but be safe)
  const seen = new Set();
  const uniq = out.filter((x) => (seen.has(x.g) ? false : (seen.add(x.g), true)));
  writeFileSync(
    join(OUT, "cells", `${c.id}.json`),
    JSON.stringify({ city: c.id, cells: uniq.map(({ g, lon, lat, d, v, top }) => ({ g, lon: r3(lon), lat: r3(lat), d, v, top })) }),
  );
  // neighbourhood vectors: mean of cells within 1.3 km of the centroid
  const hoodObjs = hoods.map((h) => {
    let near = uniq.filter((x) => dist(x._lonF, x._latF, h.lon, h.lat) <= 1.3);
    if (!near.length) near = [uniq.reduce((b, x) => (dist(x._lonF, x._latF, h.lon, h.lat) < dist(b._lonF, b._latF, h.lon, h.lat) ? x : b))];
    const v = new Array(N).fill(0);
    for (const x of near) for (let k = 0; k < N; k++) v[k] += x._v[k] / near.length;
    const meanD = near.reduce((s, x) => s + x.d, 0) / near.length;
    return {
      id: h.id, city: c.id, name: h.name, lon: h.lon, lat: h.lat, cells: near.length,
      v: v.map(r3), top: topK(v, 5), blurb: ARCH_BLURB[h.a1], _arch: h.a1, _d: meanD,
    };
  });
  allHoods.push(...hoodObjs);
  cityOut.push({ id: c.id, name: c.name, country: c.country, center: c.center, zoom: c.zoom, cellCount: uniq.length, hoodCount: hoods.length });
  console.log(c.id, "cells", uniq.length, "hoods", hoods.length);
}

// ---------- twins ----------
const byCity = {};
for (const h of allHoods) (byCity[h.city] ||= []).push(h);
const twins = {};
function explain(a, b) {
  const shared = a.map((x, i) => ({ i, a: x, b: b[i], m: Math.min(x, b[i]) })).filter((x) => x.m > 0).sort((p, q) => q.m - p.m).slice(0, 6)
    .map((x) => ({ i: x.i, a: r3(x.a), b: r3(x.b) }));
  const diverge = a.map((x, i) => ({ i, a: x, b: b[i], g: Math.abs(x - b[i]) })).sort((p, q) => q.g - p.g).slice(0, 4)
    .map((x) => ({ i: x.i, a: r3(x.a), b: r3(x.b) }));
  return { shared, diverge };
}
const rankOf = {}; // rankOf[a][b] = rank of b among its city (twin method)
for (const a of allHoods) {
  twins[a.id] = {};
  for (const c of CITIES) {
    if (c.id === a.city) continue;
    const scored = byCity[c.id].map((b) => ({ b, s: cosine(a.v, b.v) })).sort((p, q) => q.s - p.s);
    scored.forEach((x, idx) => ((rankOf[a.id] ||= {})[x.b.id] = idx + 1));
    twins[a.id][c.id] = scored.slice(0, 5).map(({ b, s }) => ({ hood: b.id, score: r3(s), ...explain(a.v, b.v) }));
  }
}

// ---------- evals ----------
const P = (a, b, split) => ({ a, b, split });
const PAIRS_SRC = [
  ["los-angeles-silver-lake","berlin-neukolln-reuterkiez","test","Time Out"],
  ["los-angeles-echo-park","berlin-friedrichshain","test","The Guardian"],
  ["los-angeles-beverly-hills","paris-passy","test","Condé Nast Traveler"],
  ["los-angeles-compton","london-brixton","dev","Vice"],
  ["los-angeles-koreatown","new-york-flushing","test","Eater"],
  ["los-angeles-boyle-heights","mexico-city-tepito","test","LA Times"],
  ["los-angeles-venice","mexico-city-condesa","test","Monocle"],
  ["los-angeles-hollywood","london-soho","test","Lonely Planet"],
  ["new-york-williamsburg","berlin-kreuzberg-so36","test","The Guardian"],
  ["new-york-williamsburg","london-shoreditch","dev","Time Out"],
  ["new-york-bushwick","berlin-neukolln-reuterkiez","dev","Vice"],
  ["new-york-upper-east-side","paris-saint-germain","test","Condé Nast Traveler"],
  ["new-york-harlem","london-brixton","test","BBC Culture"],
  ["new-york-east-village","paris-belleville","dev","Time Out"],
  ["new-york-soho","paris-le-marais","test","Vogue"],
  ["new-york-park-slope","berlin-prenzlauer-berg","test","NYT Travel"],
  ["london-shoreditch","berlin-friedrichshain","dev","Time Out"],
  ["london-camden","berlin-kreuzberg-so36","dev","NME"],
  ["london-mayfair","paris-champs-elysees","test","Condé Nast Traveler"],
  ["london-notting-hill","mexico-city-coyoacan","dev","Monocle"],
  ["london-soho","berlin-schoneberg","test","Time Out"],
  ["berlin-prenzlauer-berg","paris-batignolles","dev","Monocle"],
  ["berlin-charlottenburg","paris-passy","test","The Local"],
  ["berlin-mitte","new-york-soho","dev","Vogue"],
  ["paris-belleville","new-york-bushwick","dev","Eater"],
  ["paris-pigalle","los-angeles-west-hollywood","test","Time Out"],
  ["mexico-city-roma-norte","new-york-williamsburg","test","NYT Travel"],
  ["mexico-city-condesa","paris-canal-saint-martin","test","Monocle"],
  ["mexico-city-polanco","los-angeles-beverly-hills","test","Condé Nast Traveler"],
  ["mexico-city-tepito","los-angeles-east-la","dev","LA Times"],
  ["los-angeles-highland-park","london-hackney","test","Time Out"],
  ["berlin-wedding","paris-saint-denis","dev","The Guardian"],
];
const byId = Object.fromEntries(allHoods.map((h) => [h.id, h]));
const rng2 = mulberry32(777);
const pairs = [];
for (const [a, b, split, outlet] of PAIRS_SRC) {
  if (!byId[a] || !byId[b]) { console.warn("missing pair", a, b); continue; }
  const cityN = byCity[byId[b].city].length;
  const twin = rankOf[a][b];
  // raw: rank by closeness of mean density (activity), which is essentially arbitrary w.r.t. culture
  const raws = byCity[byId[b].city].map((h) => ({ id: h.id, s: -Math.abs(h._d - byId[a]._d) })).sort((p, q) => q.s - p.s);
  const raw = raws.findIndex((x) => x.id === b) + 1;
  const u = rng2();
  const llm = u < 0.35 ? 1 : u < 0.55 ? 2 : u < 0.7 ? 3 : 1 + Math.floor(rng2() * Math.min(cityN, 12));
  const random = 1 + Math.floor(rng2() * cityN);
  pairs.push({ ...P(a, b, split), source: `https://example.com/mock-source/${outlet.toLowerCase().replace(/[^a-z]+/g, "-")}/${pairs.length + 1}`,
    quote: `"${byId[a].name} is basically ${byId[b].name} with different weather." (${outlet}, demo data)`,
    rank: { twin, raw, llm, random } });
}
const agg = (key, split = "test") => {
  const ps = pairs.filter((p) => p.split === split);
  const n = ps.length;
  return {
    hit1: r3(ps.filter((p) => p.rank[key] <= 1).length / n),
    hit3: r3(ps.filter((p) => p.rank[key] <= 3).length / n),
    mrr: r3(ps.reduce((s, p) => s + 1 / p.rank[key], 0) / n), n,
  };
};
const sizes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const finalMrr = agg("twin").mrr;
const spread = (() => {
  const vals = [];
  for (const c of CITIES) { const hs = byCity[c.id]; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) vals.push(cosine(hs[i].v, hs[j].v)); }
  vals.sort((a, b) => a - b);
  return r3(vals[Math.floor(vals.length * 0.9)] - vals[Math.floor(vals.length * 0.1)]);
})();
const evals = {
  generatedAt: new Date().toISOString(),
  mock: true,
  split: { dev: pairs.filter((p) => p.split === "dev").length, test: pairs.filter((p) => p.split === "test").length },
  methods: {
    twin: { label: "Twin (Qloo + density correction)", ...agg("twin") },
    raw: { label: "Raw Qloo heatmaps (no correction)", ...agg("raw") },
    llm: { label: "LLM only (Claude, no data)", ...agg("llm") },
    random: { label: "Random", ...agg("random") },
  },
  pairs,
  basketSweep: sizes.map((size, i) => ({ size, mrr: r3(Math.max(0.12, finalMrr * (1 - Math.exp(-(i + 1) / 3.2)) / (1 - Math.exp(-10 / 3.2)) + gauss() * 0.015)) })),
  radiusSweep: [0.5, 0.8, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0].map((km) => ({ km, mrr: r3(finalMrr * (1 - 0.55 * Math.abs(km - 1.3) / 1.7) + gauss() * 0.012) })),
  sanity: [
    ["los-angeles", "Compton", "Kendrick Lamar", 0.98, 0.64],
    ["los-angeles", "Boyle Heights", "Bad Bunny", 0.95, 0.61],
    ["los-angeles", "East LA", "Peso Pluma", 0.99, 0.58],
    ["los-angeles", "Silver Lake", "Peso Pluma", 0.05, 0.47],
    ["los-angeles", "Koreatown", "Korean BBQ", 0.9, 0.51],
    ["berlin", "Neukölln (Reuterkiez)", "Peggy Gou", 0.96, 0.66],
    ["london", "Brixton", "Stormzy", 0.97, 0.7],
    ["new-york", "Williamsburg", "Vinyl record stores", 0.94, 0.72],
    ["paris", "Passy", "Hermès", 0.98, 0.69],
    ["mexico-city", "Polanco", "Louis Vuitton", 0.97, 0.75],
  ].map(([city, hood, item, pct, raw_pct]) => ({ city, hood, item, pct, raw_pct })),
  rawCollapse: { twin_mean_cos_spread: spread, raw_mean_cos_spread: 0.012 },
};

// ---------- write ----------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = ({ _arch, _d, ...h }) => h;
writeFileSync(join(OUT, "meta.json"), JSON.stringify({ generatedAt: new Date().toISOString(), method: "lift-v1", radiusKm: 1.3, basketSize: N, qlooCalls: 0, cities: CITIES.map((c) => c.id), mock: true }, null, 1));
writeFileSync(join(OUT, "basket.json"), JSON.stringify(BASKET.map(({ i, id, label, kind, group }) => ({ i, id, label, kind, group }))));
writeFileSync(join(OUT, "cities.json"), JSON.stringify(cityOut, null, 1));
writeFileSync(join(OUT, "hoods.json"), JSON.stringify(allHoods.map(strip)));
writeFileSync(join(OUT, "twins.json"), JSON.stringify(twins));
writeFileSync(join(OUT, "evals.json"), JSON.stringify(evals, null, 1));
console.log("methods", JSON.stringify(evals.methods));
console.log("SilverLake->Berlin", JSON.stringify(twins["los-angeles-silver-lake"].berlin.map((t) => [t.hood, t.score])));
