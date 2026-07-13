#!/usr/bin/env python
"""Check the ground-truth ``.lab`` files parse and score cleanly (Phase 0, spike 0.1).

Hand-correcting labels is error-prone — a ``:`` typed for a ``.`` in a time field, or a
segment whose end runs past the next one's start, both crash the eval run deep inside
``mir_eval`` with an opaque message. This surfaces every such problem up front, with a
``file:line`` location, so you fix them before scoring.

    python scripts/validate_labels.py                 # checks tests/eval/
    python scripts/validate_labels.py --dataset DIR    # exits non-zero if any file is bad
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.audio.labels import read_lab, validate_labels  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", default="tests/eval", help="folder of .lab files")
    args = ap.parse_args(argv)

    dataset = Path(args.dataset)
    labs = sorted(dataset.glob("*.lab"))
    if not labs:
        raise SystemExit(f"no .lab files found under {dataset}/")

    bad = 0
    for lab in labs:
        try:
            intervals, labels = read_lab(str(lab))
        except ValueError as exc:
            print(f"PARSE  {exc}")
            bad += 1
            continue
        issues = validate_labels(intervals, labels, source=str(lab))
        if issues:
            bad += 1
            for issue in issues:
                print(f"BAD    {issue}")
        else:
            print(f"ok     {lab}  ({len(labels)} segments)")

    if bad:
        print(f"\n{bad} file(s) with problems.")
        return 1
    print(f"\nall {len(labs)} label file(s) valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
