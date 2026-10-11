"""Evaluation: twin vs raw vs llm vs random on ground-truth pairs (both directions)."""
import hashlib, json, random, subprocess, sys, statistics as st
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import lift, hoods as hd
from twins import cos
from hood_defs import H

HERE = Path(__file__).parent
LLM_CACHE = HERE / "cache" / "llm"
LLM_CACHE.mkdir(parents=True, exist_ok=True)
LLM_CWD = HERE / "cache" / "llm_cwd"
LLM_CWD.mkdir(exist_ok=True)


def all_hoods(items, field="V", r=1.3, min_cov=0.35, builds=None):
    builds = builds or {}
    out = {}
    for c in lift.CITY_IDS:
        B = builds.get(c) or lift.build(c, items, min_cov)
        builds[c] = B
        out[c] = hd.hoods_for(c, B, field, r)
    return out, builds


def rank_of(src, true_id, cands):
    order = sorted(cands, key=lambda o: -cos(src["v"], o["v"]))
    return [o["id"] for o in order].index(true_id) + 1


def directed(pairs):
    for p in pairs:
        yield p, p["a"], p["b"]
        yield p, p["b"], p["a"]


def city_of(hid):
    return next(c for c in lift.CITY_IDS if hid.startswith(c + "-"))


def method_ranks(pairs, hoods_by_city):
    """rank per (pair, direction)."""
    idx = {h["id"]: h for hs in hoods_by_city.values() for h in hs}
    res = {}
    for p, s, t in directed(pairs):
        res[(p["a"], p["b"], s)] = rank_of(idx[s], t, hoods_by_city[city_of(t)])
    return res


def metrics(ranks):
    r = list(ranks)
    n = len(r)
    return dict(hit1=round(sum(x == 1 for x in r) / n, 3), hit3=round(sum(x <= 3 for x in r) / n, 3),
                mrr=round(sum(1 / x for x in r) / n, 3), n=n)


def llm_rank(src_name, src_city, tgt_city, cand_names):
    cands = sorted(cand_names)
    prompt = (f"Neighbourhood: {src_name}, {src_city_name(src_city)}.\n"
              f"Below are neighbourhoods of {src_city_name(tgt_city)}. Rank ALL of them from most to least culturally similar to "
              f"{src_name} ({src_city_name(src_city)}) - consider vibe, scene, demographics, affluence, nightlife, food, creative or immigrant character.\n"
              f"Candidates (use these exact strings): {json.dumps(cands, ensure_ascii=False)}\n"
              "Answer with ONLY a JSON array containing every candidate string exactly once, most similar first. No commentary.")
    f = LLM_CACHE / (hashlib.sha1(prompt.encode()).hexdigest() + ".json")
    if f.exists():
        return json.loads(f.read_text())
    for attempt in range(3):
        out = subprocess.run(["claude", "-p", "--model", "sonnet", "--tools", ""], input=prompt, capture_output=True, text=True,
                             timeout=300, cwd=LLM_CWD).stdout
        try:
            a = out[out.index("["): out.rindex("]") + 1]
            arr = json.loads(a)
            if isinstance(arr, list):
                f.write_text(json.dumps(arr, ensure_ascii=False))
                return arr
        except Exception:
            pass
    return []


CITY_NAMES = {"los-angeles": "Los Angeles", "new-york": "New York", "london": "London", "berlin": "Berlin",
              "mexico-city": "Mexico City", "paris": "Paris"}
src_city_name = CITY_NAMES.get


def llm_ranks(pairs, hoods_by_city):
    idx = {h["id"]: h for hs in hoods_by_city.values() for h in hs}
    jobs = list(directed(pairs))

    def run(j):
        p, s, t = j
        tc = city_of(t)
        names = [h["name"] for h in hoods_by_city[tc]]
        arr = llm_rank(idx[s]["name"], city_of(s), tc, names)
        return arr, names, idx[t]["name"]

    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(run, jobs))
    ranks, bad = {}, 0
    for (p, s, t), (arr, names, tname) in zip(jobs, results):
        seen = [x for x in arr if x in names]
        seen = list(dict.fromkeys(seen))
        if len(seen) < len(names):
            bad += 1
        rest = [n for n in names if n not in seen]  # unranked go to the end (pessimistic, tie-broken by position)
        order = seen + rest
        ranks[(p["a"], p["b"], s)] = order.index(tname) + 1
    return ranks, bad


def pct_of(vals, x):
    return sum(v <= x for v in vals) / len(vals)


SANITY = [  # (hood id, basket label, expectation)
    ("los-angeles-compton", "Kendrick Lamar", "high"), ("los-angeles-boyle-heights", "Bad Bunny", "high"),
    ("los-angeles-east-la", "Peso Pluma", "high"), ("los-angeles-silver-lake", "Peso Pluma", "low"),
    ("los-angeles-east-la", "Morgan Wallen", "low"), ("los-angeles-koreatown", "Korean food", "high"),
    ("los-angeles-west-hollywood", "Gay bars", "high"), ("los-angeles-beverly-hills", "Gucci", "high"),
    ("los-angeles-silver-lake", "Record stores", "high"),
    ("new-york-harlem", "Kendrick Lamar", "high"), ("new-york-flushing", "Chinese food", "high"),
    ("new-york-jackson-heights", "Indian food", "high"), ("new-york-chelsea", "Gay bars", "high"),
    ("new-york-upper-east-side", "Ralph Lauren", "high"), ("new-york-williamsburg", "Record stores", "high"),
    ("new-york-astoria", "Middle Eastern food", "high"),
    ("london-brixton", "Burna Boy", "high"), ("london-southall", "Indian food", "high"),
    ("london-soho", "Gay bars", "high"), ("london-mayfair", "Rolex", "high"), ("london-shoreditch", "Vintage clothing", "high"),
    ("berlin-kreuzberg-so36", "Turkish food", "high"), ("berlin-friedrichshain", "Charlotte de Witte", "high"),
    ("berlin-schoneberg", "Gay bars", "high"), ("berlin-neukolln-sonnenallee", "Middle Eastern food", "high"),
    ("berlin-prenzlauer-berg", "Playgrounds", "high"),
    ("mexico-city-zona-rosa", "Gay bars", "high"), ("mexico-city-polanco", "Gucci", "high"),
    ("mexico-city-roma-norte", "Coffee roasters", "high"), ("mexico-city-tepito", "Peso Pluma", "high"),
    ("paris-le-marais", "Gay bars", "high"), ("paris-belleville", "Chinese food", "high"),
    ("paris-chinatown-13e", "Vietnamese food", "high"), ("paris-goutte-dor", "Halal food", "high"),
    ("paris-passy", "Hermès", "high"),
]


def sanity_table(items, basket, builds, r=1.3):
    lab = {b["label"]: b["i"] for b in basket}
    rows = []
    for hid, label, exp in SANITY:
        if label not in lab:
            continue
        c = city_of(hid)
        slug = hid[len(c) + 1:]
        h = next(x for x in H[c] if x[0] == slug)
        B = builds[c]
        i = lab[label]
        v, _ = hd.hood_vec(B, h[2], h[3], "V", r)
        raw, _ = hd.hood_vec(B, h[2], h[3], "RAW", r)
        pctv, _ = hd.hood_vec(B, h[2], h[3], "PCT", r)
        zs = [row[i] for row in B["V"]]
        rs = [row[i] for row in B["RAW"]]
        rows.append(dict(city=c, hood=h[1], item=label, expect=exp, pct=round(pct_of(zs, v[i]), 3),
                         raw_pct=round(pct_of(rs, raw[i]), 3)))
    return rows


def spread(hoods_by_city):
    ranges, means = [], []
    for c, hs in hoods_by_city.items():
        for h in hs:
            for c2, hs2 in hoods_by_city.items():
                if c2 == c:
                    continue
                s = [cos(h["v"], o["v"]) for o in hs2]
                ranges.append(max(s) - min(s)); means.append(st.mean(s))
    return round(st.mean(ranges), 3), round(st.mean(means), 3)


def run(write=True):
    basket = lift.load_basket()
    ids = [b["id"] for b in basket]
    gt = json.load(open(HERE / "ground_truth.json"))["pairs"]
    test = [p for p in gt if p["split"] == "test"]
    dev = [p for p in gt if p["split"] == "dev"]
    twin_h, builds = all_hoods(ids, "V")
    raw_h, _ = all_hoods(ids, "RAW", builds=builds)
    r_twin, r_raw = method_ranks(gt, twin_h), method_ranks(gt, raw_h)
    r_llm, bad = llm_ranks(gt, twin_h)
    print("llm responses missing candidates in", bad, "of", len(r_llm))
    idx = {h["id"]: h for hs in twin_h.values() for h in hs}
    # random (analytic)
    def rand_for(pairs):
        ns = [len(twin_h[city_of(t)]) for p, s, t in directed(pairs)]
        h = lambda k: sum(min(k, n) / n for n in ns) / len(ns)
        return dict(hit1=round(h(1), 3), hit3=round(h(3), 3),
                    mrr=round(sum(sum(1 / j for j in range(1, n + 1)) / n for n in ns) / len(ns), 3), n=len(ns))
    keys = lambda pairs: [(p["a"], p["b"], s) for p, s, t in directed(pairs)]
    labels = {"twin": "Twin (Qloo + density correction)", "raw": "Raw Qloo heatmaps (no correction)",
              "llm": "LLM only (Claude Sonnet, no data)", "random": "Random"}
    methods, methods_dev = {}, {}
    for name, R in (("twin", r_twin), ("raw", r_raw), ("llm", r_llm)):
        methods[name] = dict(label=labels[name], **metrics(R[k] for k in keys(test)))
        methods_dev[name] = metrics(R[k] for k in keys(dev))
    methods["random"] = dict(label=labels["random"], **rand_for(test))
    methods_dev["random"] = rand_for(dev)
    pairs_out = []
    for p in gt:
        a, b = p["a"], p["b"]
        row = dict(a=a, b=b, split=p["split"], source=p["source"], quote=p["quote"], verbatim=p["verbatim"],
                   rank=dict(twin=r_twin[(a, b, a)], raw=r_raw[(a, b, a)], llm=r_llm[(a, b, a)],
                             random=round((len(twin_h[city_of(b)]) + 1) / 2, 1)),
                   rankRev=dict(twin=r_twin[(a, b, b)], raw=r_raw[(a, b, b)], llm=r_llm[(a, b, b)],
                                random=round((len(twin_h[city_of(a)]) + 1) / 2, 1)))
        pairs_out.append(row)
    # sweeps (twin method, MRR over directed dev+test pairs; test/dev reported separately)
    def mrr_for(hbc):
        R = method_ranks(gt, hbc)
        f = lambda ps: round(sum(1 / R[k] for k in keys(ps)) / len(keys(ps)), 3)
        return f(gt), f(dev), f(test)
    radius = []
    for km_ in (0.8, 1.3, 2.0, 3.0):
        hb, _ = all_hoods(ids, "V", r=km_, builds=builds)
        a, d, t = mrr_for(hb)
        radius.append(dict(km=km_, mrr=a, mrrDev=d, mrrTest=t))
    sweep = []
    rng = random.Random(7)
    for size in (10, 20, 40, 60, len(ids)):
        vals = []
        for seed in range(5 if size < len(ids) else 1):
            sub = sorted(rng.sample(ids, size)) if size < len(ids) else ids
            hb, _ = all_hoods(sub, "V")
            vals.append(mrr_for(hb))
        sweep.append(dict(size=size, mrr=round(st.mean(v[0] for v in vals), 3), mrrDev=round(st.mean(v[1] for v in vals), 3),
                          mrrTest=round(st.mean(v[2] for v in vals), 3),
                          sd=round(st.pstdev([v[0] for v in vals]), 3) if len(vals) > 1 else 0.0))
        print("basket", size, sweep[-1])
    t_rng, t_mean = spread(twin_h)
    r_rng, r_mean = spread(raw_h)
    ev = dict(generatedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"),
              split=dict(dev=len(dev), test=len(test)), methods=methods, methodsDev=methods_dev, pairs=pairs_out,
              basketSweep=sweep, radiusSweep=radius, sanity=sanity_table(ids, basket, builds),
              rawCollapse=dict(twin_mean_cos_spread=t_rng, raw_mean_cos_spread=r_rng, twin_mean_cos=t_mean, raw_mean_cos=r_mean,
                               definition="mean over (hood, other city) of max-min cosine to that city's hoods"))
    if write:
        json.dump(ev, open(HERE / "evals_out.json", "w"), indent=1, ensure_ascii=False)
    return ev


if __name__ == "__main__":
    ev = run()
    print(json.dumps(ev["methods"], indent=1)); print(json.dumps(ev["methodsDev"], indent=1))
    print(ev["rawCollapse"]); print(ev["radiusSweep"])
