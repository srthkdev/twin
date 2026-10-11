"""Cross-city neighbourhood twins from fingerprint files."""
import json, math, statistics as st

LA = {"Silver Lake": (34.0869, -118.2702), "Echo Park": (34.0782, -118.2606), "Highland Park": (34.1115, -118.1923),
      "Downtown LA": (34.0407, -118.2468), "Koreatown": (34.0618, -118.3005), "Hollywood": (34.0983, -118.3267),
      "West Hollywood": (34.09, -118.3617), "Beverly Hills": (34.0736, -118.4004), "Bel Air": (34.1002, -118.4595),
      "Santa Monica": (34.0195, -118.4912), "Venice": (33.985, -118.4695), "Boyle Heights": (34.0336, -118.2059),
      "East LA": (34.0239, -118.1720), "Compton": (33.8958, -118.2201), "Pasadena": (34.1478, -118.1445),
      "Encino": (34.1592, -118.5012)}
BERLIN = {"Kreuzberg SO36": (52.4995, 13.4246), "Kreuzberg 61": (52.4925, 13.3965), "Neukölln Reuterkiez": (52.4895, 13.4255),
          "Friedrichshain": (52.5125, 13.4545), "Mitte": (52.5235, 13.4010), "Prenzlauer Berg": (52.5390, 13.4240),
          "Charlottenburg": (52.5070, 13.3040), "Grunewald": (52.4880, 13.2700), "Zehlendorf": (52.4340, 13.2590),
          "Wedding": (52.5500, 13.3590), "Schöneberg": (52.4870, 13.3500), "Marzahn": (52.5440, 13.5640),
          "Spandau": (52.5360, 13.2000), "Tempelhof": (52.4660, 13.3850), "Wilmersdorf": (52.4870, 13.3160),
          "Moabit": (52.5280, 13.3420), "Dahlem": (52.4570, 13.2880), "Lichtenberg": (52.5150, 13.4990)}


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def load(fn, items=None, min_cov=0.7):
    d = json.load(open(fn))
    cells = d["cells"]
    items = items or d["basket"]
    keep = {g: c for g, c in cells.items() if sum(i in c["a"] for i in items) >= min_cov * len(items)}
    return keep, items


def lift(cells, items):
    gs = list(cells)
    # 1) per item: percentile rank of affinity across cells (missing -> 0)
    R = {}
    for i in items:
        vals = sorted(cells[g]["a"].get(i, 0) for g in gs)
        R[i] = {g: (bisect_right(vals, cells[g]["a"].get(i, 0))) / len(vals) for g in gs}
    # 2) per cell: remove the density baseline (mean rank over basket)
    base = {g: st.mean(R[i][g] for i in items) for g in gs}
    L = {i: {g: R[i][g] - base[g] for g in gs} for i in items}
    # 3) per item: z-score within city so city-wide popularity cancels
    for i in items:
        m, s = st.mean(L[i].values()), st.pstdev(L[i].values()) or 1
        L[i] = {g: (v - m) / s for g, v in L[i].items()}
    return {g: [L[i][g] for i in items] for g in gs}


from bisect import bisect_right


def hood_vec(V, cells, center, r=1.3):
    near = [g for g in V if km((cells[g]["lat"], cells[g]["lon"]), center) <= r]
    if not near:
        return None, 0
    return [st.mean(V[g][k] for g in near) for k in range(len(next(iter(V.values()))))], len(near)


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) or 1)


if __name__ == "__main__":
    import sys
    raw = len(sys.argv) > 1 and sys.argv[1] == "raw"
    la_cells, items_la = load("fp_Los_Angeles.json")
    be_cells, items_be = load("fp_Berlin.json")
    # items present in both cities
    cov = lambda cells, i: sum(i in c["a"] for c in cells.values()) / len(cells)
    items = [i for i in items_la if cov(la_cells, i) > 0.3 and cov(be_cells, i) > 0.3]
    print(len(items), "shared basket items;", len(la_cells), "LA cells;", len(be_cells), "Berlin cells")
    if raw:  # ablation: no density correction, raw affinity
        VL = {g: [la_cells[g]["a"].get(i, 0) for i in items] for g in la_cells}
        VB = {g: [be_cells[g]["a"].get(i, 0) for i in items] for g in be_cells}
    else:
        VL, VB = lift(la_cells, items), lift(be_cells, items)
    BH = {n: hood_vec(VB, be_cells, c)[0] for n, c in BERLIN.items()}
    BH = {n: v for n, v in BH.items() if v}
    for n, c in LA.items():
        v, k = hood_vec(VL, la_cells, c)
        if not v:
            print(f"{n:15s} (no cells)"); continue
        ranked = sorted(BH, key=lambda b: -cos(v, BH[b]))
        top = ", ".join(f"{b} {cos(v, BH[b]):+.2f}" for b in ranked[:3])
        print(f"{n:15s} -> {top}   | worst: {ranked[-1]}")
        # top drivers for a few
        if n in ("Silver Lake", "Beverly Hills", "West Hollywood", "Boyle Heights") and not raw:
            b = BH[ranked[0]]
            shared = sorted(range(len(items)), key=lambda k: -(v[k] + b[k]) if v[k] > 0 and b[k] > 0 else 9)[:6]
            print("      shared highs:", ", ".join(items[k].split(":", 1)[1] for k in shared))
