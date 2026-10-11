"""Cosine twins across cities with shared/diverge explanations."""
import math


def cos(a, b):
    na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b)) / (na * nb) if na and nb else 0.0


def explain(a, b, k_shared=6, k_div=4):
    m = len(a)
    both = [i for i in range(m) if a[i] > 0 and b[i] > 0]
    shared = sorted(both, key=lambda i: -min(a[i], b[i]))[:k_shared]
    div = sorted(range(m), key=lambda i: -abs(a[i] - b[i]))[:k_div]
    r = lambda x: round(x, 3)
    return ([dict(i=i, a=r(a[i]), b=r(b[i])) for i in shared], [dict(i=i, a=r(a[i]), b=r(b[i])) for i in div])


def compute_twins(hoods, topn=5):
    by_city = {}
    for h in hoods:
        by_city.setdefault(h["city"], []).append(h)
    out = {}
    for h in hoods:
        out[h["id"]] = {}
        for c, hs in by_city.items():
            if c == h["city"]:
                continue
            ranked = sorted(hs, key=lambda o: -cos(h["v"], o["v"]))[:topn]
            row = []
            for o in ranked:
                sh, dv = explain(h["v"], o["v"])
                row.append(dict(hood=o["id"], score=round(cos(h["v"], o["v"]), 3), shared=sh, diverge=dv))
            out[h["id"]][c] = row
    return out
