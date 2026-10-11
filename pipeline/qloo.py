"""Cached Qloo client (stdlib). Disk cache keyed by sha1(url). Counts real calls."""
import hashlib, json, os, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
CACHE.mkdir(exist_ok=True)
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
BASE = os.environ["QLOO_BASE_URL"]
_KEY = os.environ["QLOO_API_KEY"]
_lock = threading.Lock()
_sem = threading.Semaphore(4)
COUNTER = Path(__file__).resolve().parent / "cache" / "_calls.txt"
real_calls = 0


def get(path, params=None, retries=6):
    """GET with cache. Returns dict. HTTP errors (non-retryable) are returned as {'_http_error':code} uncached."""
    global real_calls
    qs = urllib.parse.urlencode(sorted((params or {}).items()))
    url = f"{BASE}{path}?{qs}"
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if f.exists():
        return json.loads(f.read_text())
    body = {}
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"X-Api-Key": _KEY, "Accept": "application/json"})
        with _sem:
            with _lock:
                real_calls += 1
                with open(COUNTER, "a") as c:
                    c.write("1\n")
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    body = json.loads(r.read())
                    break
            except urllib.error.HTTPError as e:
                body = {"_http_error": e.code, "_body": e.read().decode()[:500]}
                if e.code not in (429, 500, 502, 503, 504):
                    break
            except Exception as e:  # network/timeout
                body = {"_http_error": -1, "_body": str(e)[:200]}
        time.sleep(min(30, 2 ** attempt))
    if "_http_error" not in body:
        tmp = f.with_suffix(".tmp%d" % threading.get_ident())
        tmp.write_text(json.dumps(body))
        tmp.rename(f)
    return body


def total_real_calls():
    return sum(1 for _ in open(COUNTER)) if COUNTER.exists() else 0
