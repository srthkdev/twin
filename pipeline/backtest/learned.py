"""H5b (exploratory): learn w in  z(log busy) + w*z(twin)  on a random half of brands; evaluate on the other half."""
import json, math, random, statistics as st
src = open(__file__.replace("learned.py", "backtest.py")).read().split("rows = []")[0]; ns = {"__file__": __file__}; exec(src, ns)
cells, sites, busy, basket, cos, auc, recall_top, CITIES, klass, cats = (ns[k] for k in ["cells","sites","busy","basket","cos","auc","recall_top","CITIES","klass","cats"])
def z(x): m = st.mean(x); s = st.pstdev(x) or 1; return [(v - m) / s for v in x]
pairs = []
for b, by in sites.items():
    ok = [c for c in CITIES if len(by[c]) >= 5]
    if len(ok) < 2: continue
    drop = {it["i"] for it in basket if b.split()[0] in it["label"].lower() or it["label"].lower() in b}
    keep = [i for i in range(len(basket)) if i not in drop]; k = klass(cats[b].most_common(1)[0][0])
    for A in ok:
        w = sum(by[A].values()); prof = [sum(n * cells[A][g]["v"][i] for g, n in by[A].items()) / w for i in keep]
        for B in ok:
            if A == B: continue
            gs = list(cells[B]); lab = [1 if by[B][g] else 0 for g in gs]
            tw = z([cos(prof, [cells[B][g]["v"][i] for i in keep]) for g in gs])
            bz = z([math.log1p(busy[B][g] - by[B][g]) for g in gs])
            pairs.append((b, k, lab, bz, tw))
random.seed(7); brands = sorted({p[0] for p in pairs}); random.shuffle(brands); train = set(brands[: len(brands) // 2])
# grid-search w on train by median pair AUC (one parameter, coarse grid)
grid = [0, .05, .1, .15, .2, .3, .4, .5, .75, 1]
def med_auc(ps, w): return st.median(a for a in (auc([x + w * y for x, y in zip(p[3], p[4])], p[2]) for p in ps) if a is not None)
tr = [p for p in pairs if p[0] in train]; te = [p for p in pairs if p[0] not in train]
scores = {w: med_auc(tr, w) for w in grid}; best = max(scores, key=scores.get)
print("train median AUC by w:", {w: round(s, 4) for w, s in scores.items()}, "-> w =", best)
for name in ["all", "taste", "convenience", "other"]:
    ps = [p for p in te if name == "all" or p[1] == name]
    a0 = [auc(p[3], p[2]) for p in ps]; a1 = [auc([x + best * y for x, y in zip(p[3], p[4])], p[2]) for p in ps]
    r0 = [recall_top(p[3], p[2]) for p in ps]; r1 = [recall_top([x + best * y for x, y in zip(p[3], p[4])], p[2]) for p in ps]
    wins = sum(b > a for a, b in zip(a0, a1)) / len(ps)
    print(f"held-out {name:12} n={len(ps):4} busy {st.median(a0):.3f} -> busy+twin {st.median(a1):.3f} | recall@10% {st.median(r0):.3f} -> {st.median(r1):.3f} | improves {wins:.2f} of pairs")
