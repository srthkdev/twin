"""Fetch heatmaps: basket item x city. Normalises every city to geohash-6 (g7 cities are averaged up).
usage: python3 fetch.py <city-id|all> [candidates|final]"""
import json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import qloo

HERE = Path(__file__).parent
CITIES = {  # id -> (query, display name, country, [lon,lat], zoom)
    "los-angeles": ("Los Angeles County", "Los Angeles", "United States", [-118.30, 34.05], 9.6),
    "new-york": ("New York City", "New York", "United States", [-73.97, 40.72], 10.3),
    "london": ("London", "London", "United Kingdom", [-0.12, 51.51], 10.2),
    "berlin": ("Berlin", "Berlin", "Germany", [13.40, 52.51], 10.5),
    "mexico-city": ("Mexico City", "Mexico City", "Mexico", [-99.15, 19.40], 10.5),
    "paris": ("Paris and suburbs", "Paris", "France", [2.35, 48.86], 11.0),
}


def heat(city_id, item):
    q = CITIES[city_id][0]
    r = qloo.get("/v2/insights", {"filter.type": "urn:heatmap", "filter.location.query": q, item["key"]: item["val"]})
    return r.get("results", {}).get("heatmap", []) if "_http_error" not in r else None


def norm(hm):
    """-> {g6: [lat, lon, aff, pop]} averaging finer cells up to geohash-6."""
    acc = {}
    for x in hm:
        loc, qy = x["location"], x["query"]
        a = acc.setdefault(loc["geohash"][:6], [0, 0, 0, 0, 0])
        a[0] += loc["latitude"]; a[1] += loc["longitude"]; a[2] += qy["affinity"]; a[3] += qy.get("popularity", 0); a[4] += 1
    return {g: [a[0] / a[4], a[1] / a[4], a[2] / a[4], a[3] / a[4]] for g, a in acc.items()}


def fetch_city(city_id, items):
    with ThreadPoolExecutor(4) as ex:
        hms = list(ex.map(lambda it: heat(city_id, it), items))
    out, native = {}, {}
    for it, hm in zip(items, hms):
        if hm is None:
            print("  ERROR", city_id, it["label"]); continue
        out[it["id"]] = norm(hm)
        native[it["id"]] = len(hm)
    return out, native


if __name__ == "__main__":
    which = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else "candidates"
    items = json.load(open(HERE / ("basket_candidates.json" if src == "candidates" else "basket_final2.json")))
    for c in (CITIES if which == "all" else [which]):
        out, native = fetch_city(c, items)
        json.dump({"cells": out, "native": native}, open(HERE / f"raw_{c}.json", "w"))
        sparse = [i for i, v in out.items() if len(v) < 100]
        print(c, len(out), "items; sparse(<100 g6 cells):", len(sparse), "; real calls so far", qloo.total_real_calls())
