"""Build per-cell taste fingerprints for cities from a fixed basket of Qloo heatmaps."""
import json, sys
from concurrent.futures import ThreadPoolExecutor
from q import get

TAGS = [f"urn:tag:genre:place:restaurant:{t}" for t in
        ["vegan", "vietnamese", "turkish", "cocktail_bar", "coffee", "wine_bar", "brunch",
         "ramen", "sushi", "thai", "middle_eastern", "bakery", "fast_food", "steak_house",
         "mexican", "korean"]] + \
       ["urn:tag:genre:place:night_club", "urn:tag:genre:place:record_store", "urn:tag:genre:place:art_gallery"]

ENTITIES = {
    "urn:entity:artist": ["Radiohead", "Kendrick Lamar", "Bad Bunny", "Taylor Swift", "Billie Eilish",
                          "Beyoncé", "Frank Ocean", "Tame Impala", "Daft Punk", "Bon Iver", "Arctic Monkeys",
                          "Rammstein", "Ed Sheeran", "Metallica", "BTS", "Burna Boy", "Peggy Gou",
                          "Aphex Twin", "Coldplay", "Drake", "Phoebe Bridgers", "Kraftwerk", "David Guetta"],
    "urn:entity:brand": ["Patagonia", "Gucci", "Nike", "Aesop", "Carhartt", "Zara", "Rolex", "Tesla",
                         "Lululemon", "Uniqlo", "Supreme", "Hermès", "Birkenstock", "Arc'teryx"],
    "urn:entity:movie": ["The Grand Budapest Hotel", "Barbie", "Fast X", "Moonlight", "Parasite"],
}


def resolve():
    out = {}
    for typ, names in ENTITIES.items():
        for n in names:
            r = get("/search", {"query": n, "types": typ, "take": 1}).get("results", [])
            if r:
                out[f"{typ.split(':')[-1]}:{n}"] = ("signal.interests.entities", r[0]["entity_id"])
    for t in TAGS:
        out["tag:" + t.split(":")[-1]] = ("signal.interests.tags", t)
    return out


def heat(city, sig):
    key, val = sig
    r = get("/v2/insights", {"filter.type": "urn:heatmap", "filter.location.query": city, key: val})
    return r.get("results", {}).get("heatmap", [])


if __name__ == "__main__":
    basket = resolve()
    print(len(basket), "basket items")
    for city in sys.argv[1:]:
        with ThreadPoolExecutor(4) as ex:
            res = dict(zip(basket, ex.map(lambda s: heat(city, s), basket.values())))
        cells = {}
        for name, hm in res.items():
            for x in hm:
                g = x["location"]["geohash"]
                c = cells.setdefault(g, {"lat": x["location"]["latitude"], "lon": x["location"]["longitude"], "a": {}, "p": {}})
                c["a"][name] = x["query"]["affinity"]
                c["p"][name] = x["query"]["popularity"]
        fn = f"fp_{city.replace(' ', '_')}.json"
        json.dump({"basket": list(basket), "cells": cells}, open(fn, "w"))
        print(city, len(cells), "cells,", sum(1 for v in res.values() if not v), "empty heatmaps ->", fn)
