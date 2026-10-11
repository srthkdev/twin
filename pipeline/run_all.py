"""End-to-end: basket -> fetch (cached) -> evals -> export. Re-runs are free thanks to the disk caches.
usage: python3 run_all.py"""
import json, subprocess, sys
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))


def sh(*a):
    print("$", *a, flush=True)
    subprocess.run([sys.executable, *a], cwd=HERE, check=True)


if __name__ == "__main__":
    if not (HERE / "basket_candidates.json").exists():
        sh("basket.py")
    # basket_final2.json (pruned basket) is committed; fetch writes raw_{city}.json (cache hits are free)
    sh("fetch.py", "all", "final")
    sh("ground_truth.py") if not (HERE / "ground_truth.json").exists() else None
    sh("evals.py")
    sh("export.py")
