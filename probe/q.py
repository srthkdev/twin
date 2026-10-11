"""Tiny cached Qloo client for probing. Usage: python3 q.py <path> key=value ..."""
import hashlib, json, os, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k, v)

BASE = os.environ["QLOO_BASE_URL"]
KEY = os.environ["QLOO_API_KEY"]


def get(path, params=None):
    params = params or {}
    qs = urllib.parse.urlencode(sorted(params.items()))
    url = f"{BASE}{path}?{qs}"
    CACHE.mkdir(exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if f.exists():
        return json.loads(f.read_text())
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY, "Accept": "application/json"})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = {"_http_error": e.code, "_body": e.read().decode()[:2000]}
    body["_meta"] = {"url": url.replace(KEY, ""), "ms": int((time.time() - t) * 1000)}
    if "_http_error" not in body:
        f.write_text(json.dumps(body))
    return body


if __name__ == "__main__":
    path = sys.argv[1]
    params = dict(a.split("=", 1) for a in sys.argv[2:])
    print(json.dumps(get(path, params), indent=1)[:6000])
