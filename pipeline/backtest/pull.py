"""Branded places (chains) per city from Overture Maps, for the twin backtest. Output: brands_{city}.csv (brand,category,lon,lat)."""
import json, subprocess, sys
from pathlib import Path
HERE = Path(__file__).parent; WEB = HERE.parent.parent / "web"
SRC = "s3://overturemaps-us-west-2/release/2026-09-23.1/theme=places/type=place/*"
def bbox(city):
    cells = json.load(open(WEB / "public/data/cells" / f"{city}.json"))["cells"]
    xs, ys = [c["lon"] for c in cells], [c["lat"] for c in cells]
    return min(xs) - .01, min(ys) - .01, max(xs) + .01, max(ys) + .01
for city in sys.argv[1:]:
    w, s, e, n = bbox(city); dest = HERE / f"brands_{city}.csv"
    if dest.exists(): continue
    sql = f"""INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
COPY (SELECT brand.names.primary AS b, taxonomy.primary AS c, round((bbox.xmin+bbox.xmax)/2,5) AS x, round((bbox.ymin+bbox.ymax)/2,5) AS y
  FROM read_parquet('{SRC}', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
    AND brand.names.primary IS NOT NULL AND coalesce(operating_status,'open')='open') TO '{dest}' (FORMAT csv, HEADER true);"""
    r = subprocess.run(["duckdb", "-c", sql], capture_output=True, text=True, timeout=3000)
    print(city, r.returncode, r.stderr[-300:], flush=True)
