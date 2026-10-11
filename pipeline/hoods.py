"""Neighbourhood vectors = mean of cell vectors within radius of curated centroid (widen to 2 km if <3 cells)."""
import math
from hood_defs import H


def km(lat1, lon1, lat2, lon2):
    return math.hypot((lat1 - lat2) * 111.0, (lon1 - lon2) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2)))


def hood_vec(B, lat, lon, field="V", r=1.3):
    idx = [k for k in range(len(B["g"])) if km(B["lat"][k], B["lon"][k], lat, lon) <= r]
    if len(idx) < 3:
        idx = [k for k in range(len(B["g"])) if km(B["lat"][k], B["lon"][k], lat, lon) <= max(2.0, r)]
    if not idx:
        return None, 0
    M = B[field]
    m = len(M[0])
    return [sum(M[k][i] for k in idx) / len(idx) for i in range(m)], len(idx)


def hoods_for(city, B, field="V", r=1.3):
    out = []
    for slug, name, lat, lon, blurb in H[city]:
        v, n = hood_vec(B, lat, lon, field, r)
        if v is not None:
            out.append(dict(id=f"{city}-{slug}", city=city, name=name, lon=lon, lat=lat, cells=n, v=v, blurb=blurb))
    return out


if __name__ == "__main__":
    import lift
    ids = [i["id"] for i in lift.load_basket()]
    for c in lift.CITY_IDS:
        B = lift.build(c, ids)
        near = {}
        for slug, name, lat, lon, _ in H[c]:
            d = min(km(B["lat"][k], B["lon"][k], lat, lon) for k in range(len(B["g"])))
            n13 = sum(km(B["lat"][k], B["lon"][k], lat, lon) <= 1.3 for k in range(len(B["g"])))
            near[name] = (round(d, 2), n13)
        bad = {k: v for k, v in near.items() if v[0] > 0.8 or v[1] < 3}
        print(c, len(H[c]), "hoods; flagged:", bad)
