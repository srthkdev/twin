"""Chain backtest (see HYPOTHESES.md). Writes results.json."""
import csv, json, collections, math, random, statistics as st
from pathlib import Path
HERE = Path(__file__).parent; DATA = HERE.parent.parent / "web/public/data"
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
basket = json.load(open(DATA / "basket.json"))
TASTE = ["coffee", "cafe", "cloth", "fashion", "shoe", "cosmetic", "beauty", "perfume", "book", "jewel", "furniture", "decor", "bakery", "wine", "eyewear", "boutique", "tea", "accessor", "sporting", "bicycle", "salad", "juice"]
CONV = ["supermarket", "grocery", "convenience", "fast_food", "burger", "pizza", "chicken", "bank", "atm", "pharmacy", "drugstore", "gas", "fuel", "post", "mobile", "phone", "insurance", "parking", "storage", "rental", "tax", "locker", "charging", "shipping", "courier", "discount", "hardware", "auto"]
def klass(cat):
    if any(t in cat for t in CONV): return "convenience"
    if any(t in cat for t in TASTE): return "taste"
    return "other"
cells, sites, cats, busy = {}, collections.defaultdict(lambda: collections.defaultdict(collections.Counter)), collections.defaultdict(collections.Counter), {}
for c in CITIES:
    cells[c] = {x["g"]: x for x in json.load(open(DATA / "cells" / f"{c}.json"))["cells"]}
    busy[c] = collections.Counter()
    for r in csv.DictReader(open(HERE / f"brands_{c}.csv")):
        g = gh(float(r["y"]), float(r["x"]))
        if g not in cells[c]: continue
        b = r["b"].strip().lower(); sites[b][c][g] += 1; cats[b][r["c"]] += 1; busy[c][g] += 1
def cos(a, b):
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b)) / (na * nb) if na and nb else 0.0
def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l]; neg = [s for s, l in zip(scores, labels) if not l]
    if not pos or not neg: return None
    allv = sorted((s, i) for i, s in enumerate(scores)); rank = [0.0] * len(scores); i = 0
    while i < len(allv):
        j = i
        while j + 1 < len(allv) and allv[j + 1][0] == allv[i][0]: j += 1
        for k in range(i, j + 1): rank[allv[k][1]] = (i + j) / 2 + 1
        i = j + 1
    rp = sum(rank[i] for i, l in enumerate(labels) if l)
    return (rp - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))
def strat_auc(scores, labels, strata, k=10):
    order = sorted(range(len(scores)), key=lambda i: strata[i]); n = len(order); num = den = 0.0
    for q in range(k):
        idx = order[q * n // k:(q + 1) * n // k]
        a = auc([scores[i] for i in idx], [labels[i] for i in idx])
        if a is None: continue
        w = sum(labels[i] for i in idx); num += a * w; den += w
    return num / den if den else None
def recall_top(scores, labels, frac=.1):
    k = max(1, int(len(scores) * frac)); top = sorted(range(len(scores)), key=lambda i: -scores[i])[:k]
    return sum(labels[i] for i in top) / max(1, sum(labels))
rows = []
for b, by in sites.items():
    ok = [c for c in CITIES if len(by[c]) >= 5]
    if len(ok) < 2: continue
    drop = {it["i"] for it in basket if b.split()[0] in it["label"].lower() or it["label"].lower() in b}
    keep = [i for i in range(len(basket)) if i not in drop]
    cat = cats[b].most_common(1)[0][0]
    for A in ok:
        prof = [0.0] * len(keep); w = 0
        for g, n in by[A].items():
            v = cells[A][g]["v"]; prof = [p + n * v[i] for p, i in zip(prof, keep)]; w += n
        prof = [p / w for p in prof]
        for B in ok:
            if A == B: continue
            gs = list(cells[B]); lab = [1 if by[B][g] else 0 for g in gs]
            tw = [cos(prof, [cells[B][g]["v"][i] for i in keep]) for g in gs]
            bz = [busy[B][g] - by[B][g] for g in gs]  # busyness excluding the brand itself
            raw = [cells[B][g]["d"] for g in gs]
            rows.append(dict(brand=b, cat=cat, klass=klass(cat), A=A, B=B, n=sum(lab),
                twin=auc(tw, lab), busy=auc(bz, lab), raw=auc(raw, lab), strat=strat_auc(tw, lab, bz),
                rec_twin=recall_top(tw, lab), rec_busy=recall_top(bz, lab)))
json.dump(rows, open(HERE / "results.json", "w"))
def med(k, rs): v = [r[k] for r in rs if r[k] is not None]; return round(st.median(v), 3) if v else None
print("pairs", len(rows), "brands", len({r['brand'] for r in rows}))
for name, rs in [("all", rows)] + [(k, [r for r in rows if r["klass"] == k]) for k in ("taste", "convenience", "other")]:
    print(f"{name:12} n={len(rs):4}  twin {med('twin',rs)}  raw {med('raw',rs)}  busy {med('busy',rs)}  strat(twin|busy) {med('strat',rs)}  recall@10% twin {med('rec_twin',rs)} busy {med('rec_busy',rs)}  twin>raw {sum(r['twin']>r['raw'] for r in rs)/max(1,len(rs)):.2f}")
