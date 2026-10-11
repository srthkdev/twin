"""Corrected fingerprint ('lift-v1').
Per city: keep cells present in >= min_cov of items; missing item => the city's minimum affinity for that item.
Per item: percentile-rank affinity across cells (mid-rank for ties) -> subtract per-cell mean rank (density baseline)
-> z-score within city. Also returns raw-affinity matrix (ablation) and d (mean raw popularity, missing = 0)."""
import json, math
from pathlib import Path

HERE = Path(__file__).parent
CITY_IDS = ["los-angeles", "new-york", "london", "berlin", "mexico-city", "paris"]
_raw = {}


def load_raw(city):
    if city not in _raw:
        _raw[city] = json.load(open(HERE / f"raw_{city}.json"))["cells"]
    return _raw[city]


def load_basket():
    return json.load(open(HERE / "basket_final2.json"))


def midranks(vals):
    n = len(vals)
    order = sorted(range(n), key=vals.__getitem__)
    r = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        mid = (i + j + 2) / 2 / n  # mean of 1-based ranks i+1..j+1, over n
        for k in range(i, j + 1):
            r[order[k]] = mid
        i = j + 1
    return r


def build(city, item_ids, min_cov=0.35):
    raw = load_raw(city)
    cov = {}
    for it in item_ids:
        for g in raw.get(it, {}):
            cov[g] = cov.get(g, 0) + 1
    need = min_cov * len(item_ids)
    gs = sorted(g for g, c in cov.items() if c >= need)
    pos = {}
    for it in item_ids:
        for g, x in raw.get(it, {}).items():
            if g not in pos:
                pos[g] = (x[0], x[1])
    n = len(gs)
    ranks, rawaff, dens = [], [], [0.0] * n
    for it in item_ids:
        cells = raw.get(it, {})
        present = [cells[g][2] for g in gs if g in cells]
        mn = min(present) if present else 0.0
        a = [cells[g][2] if g in cells else mn for g in gs]
        for k, g in enumerate(gs):
            if g in cells:
                dens[k] += cells[g][3]
        ranks.append(midranks(a))
        rawaff.append(a)
    m = len(item_ids)
    base = [sum(ranks[i][k] for i in range(m)) / m for k in range(n)]
    Z = []
    for i in range(m):
        L = [ranks[i][k] - base[k] for k in range(n)]
        mu = sum(L) / n
        sd = math.sqrt(sum((x - mu) ** 2 for x in L) / n) or 1.0
        Z.append([(x - mu) / sd for x in L])
    # transpose to per-cell vectors
    V = [[Z[i][k] for i in range(m)] for k in range(n)]
    Rw = [[rawaff[i][k] for i in range(m)] for k in range(n)]
    pct = [[ranks[i][k] for i in range(m)] for k in range(n)]  # plain percentile (density-uncorrected)
    return dict(city=city, items=item_ids, g=gs, lat=[pos[g][0] for g in gs], lon=[pos[g][1] for g in gs],
                V=V, RAW=Rw, PCT=pct, D=[d / m for d in dens], base=base)


def top_idx(v, k=3):
    return sorted(range(len(v)), key=lambda i: -v[i])[:k]
