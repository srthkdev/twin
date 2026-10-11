"""External validation against ACS 5-year 2023 tract data (LA County, NYC). See README 'Census validation'.
Stdlib only. Run: python3 census.py <preregistered-commit-sha>"""
import json, math, random, sys
from pathlib import Path
import lift

HERE = Path(__file__).parent
CC = HERE / "cache" / "census"
CITIES = {"los-angeles": ["06037"], "new-york": ["36005", "36047", "36061", "36081", "36085"]}
B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def gh_encode(lat, lon, p=6):
    la, lo = [-90.0, 90.0], [-180.0, 180.0]
    out, bits, ch, even = [], 0, 0, True
    while len(out) < p:
        rng, v = (lo, lon) if even else (la, lat)
        mid = (rng[0] + rng[1]) / 2
        ch <<= 1
        if v >= mid:
            ch |= 1; rng[0] = mid
        else:
            rng[1] = mid
        even = not even
        bits += 1
        if bits == 5:
            out.append(B32[ch]); bits = 0; ch = 0
    return "".join(out)


def read_table(name, prefixes):
    """-> {geoid11: {col: float|None}} for tracts whose GEOID starts with a prefix."""
    out = {}
    with open(CC / f"raw_{name}.dat") as f:
        cols = f.readline().rstrip("\n").split("|")
        for line in f:
            if not line.startswith("1400000US"):
                continue
            gid = line[9:20]
            if not gid.startswith(prefixes):
                continue
            row = {}
            for c, v in zip(cols[1:], line.rstrip("\n").split("|")[1:]):
                try:
                    x = float(v)
                except ValueError:
                    x = None
                row[c] = None if x is None or x < -1e8 else x
            out[line[9:20]] = row
    return out


def tracts(city):
    pre = tuple(CITIES[city])
    T = {n: read_table(n, pre) for n in ["b01003", "b03003", "b02001", "b02015", "b19013", "b01002", "b15003", "b03002"]}
    gaz = {}
    for line in open(CC / "gaz" / "2023_Gaz_tracts_national.txt"):
        p = line.rstrip("\n").split("\t")
        if p[1].startswith(pre):
            gaz[p[1]] = (float(p[6]), float(p[7]))
    rows = []
    for gid, pop_row in T["b01003"].items():
        if gid not in gaz:
            continue
        g = lambda t, c: (T[t].get(gid) or {}).get(c)
        pop = g("b01003", "B01003_E001")
        if not pop:
            continue
        r = dict(pop=pop, lat=gaz[gid][0], lon=gaz[gid][1])
        # (numerator, denominator) pairs, summed within a cell
        def s(*xs):
            return None if any(x is None for x in xs) else sum(xs)
        r["pct_hispanic"] = (g("b03003", "B03003_E003"), g("b03003", "B03003_E001"))
        r["pct_black"] = (g("b02001", "B02001_E003"), g("b02001", "B02001_E001"))
        r["pct_asian"] = (g("b02001", "B02001_E005"), g("b02001", "B02001_E001"))
        r["pct_korean"] = (g("b02015", "B02015_E005"), pop)
        r["pct_chinese"] = (g("b02015", "B02015_E002"), pop)
        r["pct_nhwhite"] = (g("b03002", "B03002_E003"), g("b03002", "B03002_E001"))
        r["pct_bachelor"] = (s(*[g("b15003", f"B15003_E0{k}") for k in (22, 23, 24, 25)]), g("b15003", "B15003_E001"))
        r["med_income"] = g("b19013", "B19013_E001")
        r["med_age"] = g("b01002", "B01002_E001")
        rows.append(r)
    return rows


def aggregate(rows):
    cells = {}
    for r in rows:
        cells.setdefault(gh_encode(r["lat"], r["lon"]), []).append(r)
    out = {}
    for g, rs in cells.items():
        pop = sum(r["pop"] for r in rs)
        if pop < 500:
            continue
        d = dict(pop=pop, ntracts=len(rs))
        for k in ["pct_hispanic", "pct_black", "pct_asian", "pct_korean", "pct_chinese", "pct_nhwhite", "pct_bachelor"]:
            ok = [r[k] for r in rs if r[k][0] is not None and r[k][1]]
            den = sum(x[1] for x in ok)
            d[k] = sum(x[0] for x in ok) / den if den else None
        for k in ["med_income", "med_age"]:
            ok = [(r[k], r["pop"]) for r in rs if r[k] is not None]
            w = sum(x[1] for x in ok)
            d[k] = sum(x[0] * x[1] for x in ok) / w if w else None
        out[g] = d
    return out


def rank(v):
    return lift.midranks(v)


def pearson(a, b):
    n = len(a); ma = sum(a) / n; mb = sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a); sbb = sum((y - mb) ** 2 for y in b)
    return sab / math.sqrt(saa * sbb) if saa and sbb else 0.0


def spearman(a, b):
    return pearson(rank(a), rank(b))


def boot_ci(a, b, idxs):
    ra, rb = rank(a), rank(b)  # ranks fixed on the full sample; resampled Pearson of ranks (percentile bootstrap)
    rs = sorted(pearson([ra[i] for i in ix], [rb[i] for i in ix]) for ix in idxs)
    return [round(rs[int(0.025 * len(rs))], 3), round(rs[int(0.975 * len(rs)) - 1], 3)]


def main(commit):
    H = json.load(open(HERE / "census_hypotheses.json"))["hypotheses"]
    basket = lift.load_basket()
    ids = [b["id"] if isinstance(b, dict) else b for b in basket]
    pos = {i: k for k, i in enumerate(ids)}
    rows, scatter, stats = [], {}, {}
    for city in CITIES:
        B = lift.build(city, ids)
        census = aggregate(tracts(city))
        keep = [k for k, g in enumerate(B["g"]) if g in census]
        stats[city] = dict(tractsCells=len(census), qlooCells=len(B["g"]), joined=len(keep))
        rng = random.Random(20261012)
        for h in H:
            col = [pos[i] for i in h["items"]]
            ks = [k for k in keep if census[B["g"][k]][h["variable"]] is not None]
            x = [census[B["g"][k]][h["variable"]] for k in ks]
            yc = [sum(B["V"][k][c] for c in col) / len(col) for k in ks]
            yr = [sum(B["RAW"][k][c] for c in col) / len(col) for k in ks]
            yd = [B["D"][k] for k in ks]
            n = len(ks)
            idxs = [[rng.randrange(n) for _ in range(n)] for _ in range(1000)]
            row = dict(city=city, id=h["id"], label=h["label"], items=h["items"], variable=h["variable"], expected=h["expected"],
                       rhoCorrected=round(spearman(x, yc), 3), ciCorrected=boot_ci(x, yc, idxs),
                       rhoRaw=round(spearman(x, yr), 3), ciRaw=boot_ci(x, yr, idxs),
                       rhoDensity=round(spearman(x, yd), 3), n=n)
            rows.append(row)
            sc = random.Random(7).sample(range(n), min(400, n))
            scatter[f"{city}|{h['label']}"] = [[round(x[i], 4), round(yc[i], 3), round(yr[i], 4)] for i in sc]
            print(city, h["id"], row["rhoCorrected"], row["rhoRaw"], row["rhoDensity"], n, flush=True)
    sg = lambda r, k: (1 if r["expected"] == "+" else -1) * r[k]
    summ = dict(n=len(rows),
                correctSignCorrected=sum(sg(r, "rhoCorrected") > 0 for r in rows),
                correctSignRaw=sum(sg(r, "rhoRaw") > 0 for r in rows),
                correctedBeatsRaw=sum(sg(r, "rhoCorrected") > sg(r, "rhoRaw") for r in rows),
                meanAbsRhoCorrected=round(sum(abs(r["rhoCorrected"]) for r in rows) / len(rows), 3),
                meanAbsRhoRaw=round(sum(abs(r["rhoRaw"]) for r in rows) / len(rows), 3),
                meanSignedRhoCorrected=round(sum(sg(r, "rhoCorrected") for r in rows) / len(rows), 3),
                meanSignedRhoRaw=round(sum(sg(r, "rhoRaw") for r in rows) / len(rows), 3))
    heads = ["Latin artists ↔ % Hispanic", "Luxury brands ↔ median income", "Korean food ↔ % Korean"]
    sc_out = {k: v for k, v in scatter.items() if k.split("|", 1)[1] in heads and k.split("|")[0] in ("los-angeles", "new-york")}
    # headline scatters: LA for all three
    sc_out = {f"los-angeles|{h}": scatter[f"los-angeles|{h}"] for h in heads}
    ev_path = HERE.parent / "web" / "public" / "data" / "evals.json"
    ev = json.load(open(ev_path))
    ev["census"] = dict(acsYear=2023, cities=list(CITIES), preregisteredCommit=commit, summary=summ, rows=rows, scatter=sc_out,
                        joinStats=stats)
    json.dump(ev, open(ev_path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(json.dumps(summ), stats)


if __name__ == "__main__":
    main(sys.argv[1])
