"""Select the 40-item core basket (dimension contract for live cities) and write core fingerprints for the static cities.

Selection uses ONLY coverage and cross-cell variance of the 116-item static data (no ground-truth pairs):
  score(item) = min over the 6 cities of (share of that city's cells where the item is present)  x  mean over cities of
                the cross-cell sd of (percentile rank - cell baseline)   [the pre-z signal the fingerprint is made of]
Items with min coverage < MIN_COV are excluded; the 40 slots are split over groups proportionally (min 2 per group,
largest remainder), best score first inside each group.
Then reports DEV-pair MRR (never test) for core-40 vs the full 116, plus a random-40 reference.
Core cell format: {g,lon,lat,b,v}; b = cell baseline (mean percentile rank over the basket), used to correct single new items.
Outputs: web/lib/agent/data/core-basket.json, web/public/data/core/{city}.json (zero Qloo calls; reads raw_*.json)."""
import json, math, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import lift, hoods as hd
from evals import all_hoods, method_ranks, metrics

HERE = Path(__file__).parent
ROOT = HERE.parent
N = 40
MIN_COV = 0.45


def r3(v):
    return [round(x, 3) for x in v]


def item_stats(basket):
    ids = [b["id"] for b in basket]
    cov = {i: [] for i in ids}
    sd = {i: [] for i in ids}
    for c in lift.CITY_IDS:
        B = lift.build(c, ids)
        n = len(B["g"])
        raw = lift.load_raw(c)
        gs = set(B["g"])
        for k, it in enumerate(ids):
            cov[it].append(sum(1 for g in raw.get(it, {}) if g in gs) / n)
            L = [B["PCT"][j][k] - B["base"][j] for j in range(n)]
            mu = sum(L) / n
            sd[it].append(math.sqrt(sum((x - mu) ** 2 for x in L) / n))
    return {it: dict(mincov=min(cov[it]), meancov=sum(cov[it]) / 6, sd=sum(sd[it]) / 6) for it in ids}


def select(basket, st):
    groups = {}
    for b in basket:
        groups.setdefault(b["group"], []).append(b)
    tot = len(basket)
    quota = {g: max(2, int(N * len(v) / tot)) for g, v in groups.items()}
    rem = sorted(groups, key=lambda g: -(N * len(groups[g]) / tot - int(N * len(groups[g]) / tot)))
    while sum(quota.values()) < N:
        quota[rem.pop(0)] += 1
    while sum(quota.values()) > N:
        g = max(quota, key=quota.get); quota[g] -= 1
    score = lambda b: st[b["id"]]["mincov"] * st[b["id"]]["sd"]
    chosen = []
    for g, v in groups.items():
        ok = sorted([b for b in v if st[b["id"]]["mincov"] >= MIN_COV], key=score, reverse=True)
        chosen += ok[: quota[g]]
    if len(chosen) < N:  # top up from the best remaining
        left = sorted([b for b in basket if b not in chosen and st[b["id"]]["mincov"] >= MIN_COV], key=score, reverse=True)
        chosen += left[: N - len(chosen)]
    return chosen, quota


def dev_mrr(items, gt_dev):
    hb, _ = all_hoods(items, "V")
    R = method_ranks(gt_dev, hb)
    return metrics(R.values())


def main():
    basket = lift.load_basket()
    st = item_stats(basket)
    chosen, quota = select(basket, st)
    ids = [b["id"] for b in chosen]
    out = [dict(id=b["id"], label=b["label"], kind=b["kind"], group=b["group"], key=b["key"], val=b["val"]) for b in chosen]
    p = ROOT / "web/lib/agent/data/core-basket.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("quota", quota)
    for b in chosen:
        s = st[b["id"]]
        print(f"  {b['group']:9s} {b['kind']:9s} {b['label']:28s} mincov {s['mincov']:.2f} sd {s['sd']:.3f}")

    # static-city core fingerprints
    outdir = ROOT / "web/public/data/core"
    outdir.mkdir(parents=True, exist_ok=True)
    for c in lift.CITY_IDS:
        B = lift.build(c, ids)
        cells = [dict(g=B["g"][k], lon=round(B["lon"][k], 4), lat=round(B["lat"][k], 4), b=round(B["base"][k], 3), v=r3(B["V"][k])) for k in range(len(B["g"]))]
        hs = [dict(id=h["id"], name=h["name"], lon=h["lon"], lat=h["lat"], v=r3(h["v"])) for h in hd.hoods_for(c, B, "V", 1.3)]
        s = json.dumps(dict(city=c, items=ids, cells=cells, hoods=hs), ensure_ascii=False, separators=(",", ":"))
        (outdir / f"{c}.json").write_text(s)
        print(c, len(cells), "cells", len(hs), "hoods", round(len(s) / 1e6, 2), "MB")

    # DEV-only evaluation
    gt = json.load(open(HERE / "ground_truth.json"))["pairs"]
    dev = [q for q in gt if q["split"] == "dev"]
    full = dev_mrr([b["id"] for b in basket], dev)
    core = dev_mrr(ids, dev)
    rng = random.Random(11)
    rnd = [dev_mrr(rng.sample([b["id"] for b in basket], N), dev)["mrr"] for _ in range(5)]
    print("DEV pairs:", len(dev), "directed:", full["n"])
    print("116 :", full)
    print("core:", core)
    print("random-40 x5 mrr:", rnd, "mean", round(sum(rnd) / 5, 3))


if __name__ == "__main__":
    main()
