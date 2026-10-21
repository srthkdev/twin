import json, math, statistics as st, importlib.util, sys
spec = importlib.util.spec_from_file_location("bt", "backtest.py")
src = open("backtest.py").read().split("rows = []")[0]; ns = {"__file__": __file__}; exec(src, ns)
cells, sites, busy, basket, cos, auc, recall_top, CITIES = (ns[k] for k in ["cells","sites","busy","basket","cos","auc","recall_top","CITIES"])
klass, cats = ns["klass"], ns["cats"]
def z(x): m = st.mean(x); s = st.pstdev(x) or 1; return [(v - m) / s for v in x]
out = []
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
            tw = [cos(prof, [cells[B][g]["v"][i] for i in keep]) for g in gs]
            bz = [math.log1p(busy[B][g] - by[B][g]) for g in gs]
            cb = [a + c for a, c in zip(z(bz), z(tw))]
            out.append(dict(brand=b, klass=k, A=A, B=B, busy=auc(bz, lab), combo=auc(cb, lab), rb=recall_top(bz, lab), rc=recall_top(cb, lab)))
json.dump(out, open("combo.json", "w"))
for name in ["all", "taste", "convenience", "other"]:
    rs = [r for r in out if name == "all" or r["klass"] == name]
    md = lambda k: round(st.median([r[k] for r in rs if r[k] is not None]), 3)
    win = sum(r["combo"] > r["busy"] for r in rs if r["combo"] is not None) / len(rs)
    print(f"{name:12} n={len(rs):4} busy {md('busy')} busy+twin {md('combo')} | recall@10% busy {md('rb')} busy+twin {md('rc')} | combo wins {win:.2f}")
