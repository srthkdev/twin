"""Exploratory (after H1–H5): does a *learned* taste match beat busyness on held-out brands?
Score(cell | brand) = logistic(w0*log_busy + w · (profile_A ⊙ cell_B)), 5-fold GroupKFold by brand.
Baseline: the same logistic with log_busy only. Metric: per-pair AUC on held-out brands, all cells of city B.
Writes model.json (fold-level and per-class medians with 95% bootstrap CIs)."""
import csv, json, collections, math
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
HERE = Path(__file__).parent; DATA = HERE.parent.parent / "web/public/data"
ns = {"__file__": str(HERE / "backtest.py")}; exec(open(HERE / "backtest.py").read().split("cells, sites, cats")[0], ns)
CITIES, gh, klass = ns["CITIES"], ns["gh"], ns["klass"]
basket = json.load(open(DATA / "basket.json"))
V, G, busy = {}, {}, {}
sites = collections.defaultdict(lambda: collections.defaultdict(collections.Counter)); cats = collections.defaultdict(collections.Counter)
for c in CITIES:
    cl = json.load(open(DATA / "cells" / f"{c}.json"))["cells"]
    G[c] = {x["g"]: i for i, x in enumerate(cl)}; V[c] = np.array([x["v"] for x in cl], dtype=np.float32)
    busy[c] = np.zeros(len(cl), dtype=np.float32)
    for r in csv.DictReader(open(HERE / f"brands_{c}.csv")):
        i = G[c].get(gh(float(r["y"]), float(r["x"])))
        if i is None: continue
        b = r["b"].strip().lower(); sites[b][c][i] += 1; cats[b][r["c"]] += 1; busy[c][i] += 1
pairs = []
for b, by in sites.items():
    ok = [c for c in CITIES if len(by[c]) >= 5]
    if len(ok) < 2: continue
    mask = np.ones(len(basket), dtype=bool)
    for it in basket:
        if b.split()[0] in it["label"].lower() or it["label"].lower() in b: mask[it["i"]] = False
    k = klass(cats[b].most_common(1)[0][0])
    for A in ok:
        idx = np.array(list(by[A].keys())); w = np.array([by[A][i] for i in idx], dtype=np.float32)
        prof = (V[A][idx] * w[:, None]).sum(0) / w.sum(); prof = prof * mask
        prof = prof / (np.linalg.norm(prof) or 1)
        for B in ok:
            if A == B: continue
            y = np.zeros(len(V[B]), dtype=np.int8); y[list(by[B].keys())] = 1
            own = np.zeros(len(V[B]), dtype=np.float32); own[list(by[B].keys())] = [by[B][i] for i in by[B]]
            lb = np.log1p(busy[B] - own); lb = (lb - lb.mean()) / (lb.std() or 1)
            pairs.append(dict(brand=b, klass=k, A=A, B=B, prof=prof, y=y, lb=lb))
print("pairs", len(pairs))
def feats(p, rows=None):
    Vb = V[p["B"]] if rows is None else V[p["B"]][rows]; lb = p["lb"] if rows is None else p["lb"][rows]
    Vn = Vb / (np.linalg.norm(Vb, axis=1, keepdims=True) + 1e-6)
    return np.hstack([lb[:, None], Vn * p["prof"][None, :]])
rng = np.random.default_rng(0)
groups = np.array([p["brand"] for p in pairs]); res = []
for fold, (tr, te) in enumerate(GroupKFold(5).split(np.zeros(len(pairs)), groups=groups)):
    X, Y = [], []
    for j in tr:
        p = pairs[j]; pos = np.flatnonzero(p["y"]); neg = rng.choice(np.flatnonzero(p["y"] == 0), size=min(300, int((p["y"] == 0).sum())), replace=False)
        rows = np.concatenate([pos, neg]); X.append(feats(p, rows)); Y.append(p["y"][rows])
    X, Y = np.vstack(X), np.concatenate(Y)
    full = LogisticRegression(C=0.5, max_iter=2000).fit(X, Y)
    base = LogisticRegression(max_iter=1000).fit(X[:, :1], Y)
    for j in te:
        p = pairs[j]; F = feats(p)
        a_full = roc_auc_score(p["y"], full.decision_function(F)); a_base = roc_auc_score(p["y"], base.decision_function(F[:, :1]))
        res.append(dict(brand=p["brand"], klass=p["klass"], A=p["A"], B=p["B"], n=int(p["y"].sum()), busy=a_base, model=a_full, fold=fold))
    print("fold", fold, "done", flush=True)
def boot(x, n=2000):
    x = np.asarray(x); m = [np.median(rng.choice(x, len(x))) for _ in range(n)]; return [round(float(np.percentile(m, 2.5)), 4), round(float(np.percentile(m, 97.5)), 4)]
summary = {}
for name in ["all", "taste", "convenience", "other"]:
    rs = [r for r in res if name == "all" or r["klass"] == name]
    d = [r["model"] - r["busy"] for r in rs]
    summary[name] = dict(n=len(rs), busy=round(float(np.median([r["busy"] for r in rs])), 4), model=round(float(np.median([r["model"] for r in rs])), 4),
                         delta=round(float(np.median(d)), 4), delta_ci=boot(d), improves=round(float(np.mean(np.array(d) > 0)), 3))
    print(name, summary[name])
json.dump({"summary": summary, "pairs": res}, open(HERE / "model.json", "w"))
