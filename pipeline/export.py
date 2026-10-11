"""Write web/public/data/* per CONTRACT.md."""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import lift, qloo
from fetch import CITIES
from hoods import hoods_for, km
from hood_defs import H
from twins import compute_twins

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
RADIUS = 1.3
MAX_CELLS_BYTES = 2_500_000


def r3(v, nd=3):
    return [round(x, nd) for x in v]


def top(v, k):
    return sorted(range(len(v)), key=lambda i: -v[i])[:k]


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(s)
    return len(s.encode())


def export(evals_path=Path(__file__).parent / "evals_out.json"):
    basket = lift.load_basket()
    ids = [b["id"] for b in basket]
    sizes, hoods_all, cities_out = {}, [], []
    for c in lift.CITY_IDS:
        B = lift.build(c, ids)
        cells = []
        # file-size control: 3 dp -> 2 dp -> additionally drop cells far from every curated hood (vectors were computed on ALL cells)
        cs = [(c0[2], c0[3]) for c0 in H[c]]
        far = lambda k: min(km(B["lat"][k], B["lon"][k], la, lo) for la, lo in cs)
        keep_all = list(range(len(B["g"])))
        for nd, maxkm in ((3, None), (2, None), (2, 25), (2, 18), (2, 12)):
            ks = keep_all if maxkm is None else [k for k in keep_all if far(k) <= maxkm]
            cells = [dict(g=B["g"][k], lon=round(B["lon"][k], 4), lat=round(B["lat"][k], 4), d=round(B["D"][k], 3),
                          v=r3(B["V"][k], nd), top=top(B["V"][k], 3)) for k in ks]
            size = len(json.dumps({"city": c, "cells": cells}, separators=(",", ":")))
            if size <= MAX_CELLS_BYTES:
                break
        print(c, "cells exported", len(cells), "of", len(B["g"]), "dp", nd, "maxkm", maxkm)
        sizes[f"cells/{c}.json"] = dump(OUT / "cells" / f"{c}.json", {"city": c, "cells": cells})
        hs = hoods_for(c, B, "V", RADIUS)
        for h in hs:
            hoods_all.append(dict(id=h["id"], city=c, name=h["name"], lon=h["lon"], lat=h["lat"], cells=h["cells"],
                                  v=r3(h["v"]), top=top(h["v"], 5), blurb=h["blurb"]))
        q, name, country, center, zoom = CITIES[c]
        cities_out.append(dict(id=c, name=name, country=country, center=center, zoom=zoom, cellCount=len(cells), hoodCount=len(hs)))
    sizes["basket.json"] = dump(OUT / "basket.json", [dict(i=b["i"], id=b["id"], label=b["label"], kind=b["kind"], group=b["group"]) for b in basket])
    sizes["cities.json"] = dump(OUT / "cities.json", cities_out)
    sizes["hoods.json"] = dump(OUT / "hoods.json", hoods_all)
    sizes["twins.json"] = dump(OUT / "twins.json", compute_twins(hoods_all))
    meta = dict(generatedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), method="lift-v1", radiusKm=RADIUS,
                basketSize=len(basket), qlooCalls=qloo.total_real_calls(), cities=lift.CITY_IDS)
    sizes["meta.json"] = dump(OUT / "meta.json", meta)
    if evals_path.exists():
        sizes["evals.json"] = dump(OUT / "evals.json", json.load(open(evals_path)))
    return sizes, meta


if __name__ == "__main__":
    s, m = export()
    for k, v in sorted(s.items()):
        print(f"{v/1024:8.1f} KB  {k}")
    print(m)
