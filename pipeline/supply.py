"""Venue SUPPLY per 1 km cell from Overture Maps Places (open, global POI data), via the DuckDB CLI.

Physical facts only — how many venues of a kind exist in each geohash-6 cell. Taste/demand stays with Qloo.
Output: web/public/data/supply/{city}.json = {city, source, release, kinds: [...], cells: {geohash: [count per kind]}}
usage: python3 supply.py [cityId ...]   (default: every city with a core file)
"""
import json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
WEB = HERE.parent / "web"
RELEASE = "2026-09-23.1"
SRC = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"

# kind -> Overture taxonomy.primary values (exact) or a suffix rule
KINDS = {
    "bar": ["bar", "pub", "cocktail_bar", "wine_bar", "beer_bar", "dive_bar", "gastropub", "sports_bar", "tapas_bar", "hotel_bar", "gay_bar"],
    "wine_bar": ["wine_bar"],
    "cocktail_bar": ["cocktail_bar"],
    "cafe": ["cafe", "coffee_shop"],
    "nightclub": ["dance_club", "nightlife_venue"],
    "music_venue": ["music_venue"],
    "record_store": ["vinyl_record_store", "music_and_dvd_store"],
    "art_gallery": ["art_gallery"],
    "bookstore": ["bookstore"],
    "vintage": ["second_hand_store", "second_hand_clothing_store"],
    "boutique": ["fashion_boutique"],
    "gym": ["gym", "sport_or_fitness_facility"],
    "yoga": ["yoga_studio"],
    "bakery": ["bakery"],
    "vegan": ["vegan_restaurant"],
    "ramen": ["ramen_restaurant"],
    "sushi": ["sushi_restaurant"],
    "mexican": ["mexican_restaurant", "taco_restaurant"],
    "korean": ["korean_restaurant"],
    "gay_bar": ["gay_bar"],
    "comedy_club": ["comedy_club"],
    "cinema": ["movie_theater"],
    "tattoo": ["tattoo", "tattoo_and_piercing"],
    "brewery": ["brewery"],
    "restaurant": "%_restaurant",
}


def bbox(city):
    for p in (WEB / "public/data/core" / f"{city}.json", WEB / ".cache/twin/cities" / city / "cells.json"):
        if p.exists():
            cells = json.load(open(p))["cells"]
            lats, lons = sorted(c["lat"] for c in cells), sorted(c["lon"] for c in cells)
            return lons[0] - 0.01, lats[0] - 0.01, lons[-1] + 0.01, lats[-1] + 0.01
    raise SystemExit(f"no core cells for {city}")


B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash(lat, lon, prec=6):
    la, lo, out, bit, ch, even = [-90.0, 90.0], [-180.0, 180.0], "", 0, 0, True
    while len(out) < prec:
        r, v = (lo, lon) if even else (la, lat)
        m = (r[0] + r[1]) / 2
        if v >= m: ch = (ch << 1) | 1; r[0] = m
        else: ch <<= 1; r[1] = m
        even = not even
        bit += 1
        if bit == 5: out += B32[ch]; bit = ch = 0
    return out


def run(city):
    w, s, e, n = bbox(city)
    names = list(KINDS)
    exact = sorted({c for v in KINDS.values() if isinstance(v, list) for c in v})
    sql = f"""
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
COPY (
  SELECT taxonomy.primary AS c, round((bbox.xmin + bbox.xmax) / 2, 5) AS x, round((bbox.ymin + bbox.ymax) / 2, 5) AS y
  FROM read_parquet('{SRC}', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
    AND coalesce(operating_status, 'open') = 'open'
    AND (taxonomy.primary IN ({",".join(f"'{x}'" for x in exact)}) OR taxonomy.primary LIKE '%_restaurant')
) TO '/dev/stdout' (FORMAT csv, HEADER false);"""
    out = subprocess.run(["duckdb", "-c", sql], capture_output=True, text=True, timeout=1800)
    if out.returncode:
        raise SystemExit(out.stderr[-800:])
    cells = {}
    for line in out.stdout.splitlines():
        try: c, x, y = line.split(","); x, y = float(x), float(y)
        except ValueError: continue
        row = cells.setdefault(geohash(y, x), [0] * len(names))
        for i, k in enumerate(names):
            v = KINDS[k]
            if (c.endswith("_restaurant") if isinstance(v, str) else c in v): row[i] += 1
    dest = WEB / "public/data/supply" / f"{city}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"city": city, "source": "Overture Maps Places", "release": RELEASE, "kinds": names, "cells": cells}, open(dest, "w"), separators=(",", ":"))
    tot = [sum(c[i] for c in cells.values()) for i in range(len(names))]
    print(f"{city}: {len(cells)} cells · " + ", ".join(f"{k} {t}" for k, t in zip(names, tot) if k in ("bar", "wine_bar", "cafe", "record_store", "art_gallery", "restaurant")), flush=True)


if __name__ == "__main__":
    cities = sys.argv[1:] or [p.stem for p in (WEB / "public/data/core").glob("*.json")] + [p.name for p in (WEB / ".cache/twin/cities").glob("*") if p.is_dir()]
    for c in cities:
        run(c)
