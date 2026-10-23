"""Compact chain index for the app's brand tools: per city, every brand with 3+ branches -> its category, class
(taste-led / convenience / other) and branch count per geohash-6 cell. Reads the Overture pulls from pull.py."""
import csv, json, collections
from pathlib import Path
HERE = Path(__file__).parent; DATA = HERE.parent.parent / "web/public/data"
# same geohash and chain classes as backtest.py
CITIES = ["london", "new-york", "los-angeles", "paris", "berlin", "mexico-city"]
B32 = "0123456789bcdefghjkmnpqrstuvwxyz"
def gh(lat, lon, p=6):
    la, lo, out, bit, ch, ev = [-90., 90.], [-180., 180.], "", 0, 0, True
    while len(out) < p:
        r, v = (lo, lon) if ev else (la, lat); m = (r[0] + r[1]) / 2
        if v >= m: ch = ch << 1 | 1; r[0] = m
        else: ch <<= 1; r[1] = m
        ev = not ev; bit += 1
        if bit == 5: out += B32[ch]; bit = ch = 0
    return out
TASTE = ["coffee", "cafe", "cloth", "fashion", "shoe", "cosmetic", "beauty", "perfume", "book", "jewel", "furniture", "decor", "bakery", "wine", "eyewear", "boutique", "tea", "accessor", "sporting", "bicycle", "salad", "juice"]
CONV = ["supermarket", "grocery", "convenience", "fast_food", "burger", "pizza", "chicken", "bank", "atm", "pharmacy", "drugstore", "gas", "fuel", "post", "mobile", "phone", "insurance", "parking", "storage", "rental", "tax", "locker", "charging", "shipping", "courier", "discount", "hardware", "auto"]
def klass(cat):
    if any(t in cat for t in CONV): return "convenience"
    if any(t in cat for t in TASTE): return "taste"
    return "other"
OUT = DATA / "brands"; OUT.mkdir(exist_ok=True)
for c in CITIES:
    sites, cats, names = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter), {}
    for r in csv.DictReader(open(HERE / f"brands_{c}.csv")):
        name = r["b"].strip(); key = name.lower()
        sites[key][gh(float(r["y"]), float(r["x"]))] += 1; cats[key][r["c"]] += 1; names.setdefault(key, name)
    brands = {}
    for key, g in sites.items():
        if sum(g.values()) < 3: continue
        cat = cats[key].most_common(1)[0][0]
        brands[names[key]] = {"cat": cat, "class": klass(cat), "g": dict(g)}
    json.dump({"city": c, "source": "Overture Maps Places 2026-09-23.1", "brands": brands}, open(OUT / f"{c}.json", "w"), separators=(",", ":"))
    print(c, len(brands), "chains", round((OUT / f"{c}.json").stat().st_size / 1024), "KB")
