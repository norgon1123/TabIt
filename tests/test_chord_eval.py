import pytest

from app.audio.chord_eval import (
    ClipScore,
    aggregate,
    bootstrap_delta_ci,
    clip_duration,
    score_labels,
    win_rate,
)


def test_clip_duration_spans_min_to_max():
    assert clip_duration([(0.0, 1.0), (1.0, 3.0)]) == 3.0
    assert clip_duration([]) == 0.0


def test_aggregate_is_duration_weighted():
    clips = [
        ClipScore("a", 1.0, {"majmin": 1.0}),
        ClipScore("b", 3.0, {"majmin": 0.0}),
    ]
    # (1*1 + 3*0) / 4 = 0.25, not the unweighted 0.5.
    assert aggregate(clips, ("majmin",))["majmin"] == pytest.approx(0.25)


def test_win_rate_counts_per_clip_wins_not_aggregate():
    engine = [
        ClipScore("a", 10.0, {"majmin": 0.95}),  # win, big + long
        ClipScore("b", 1.0, {"majmin": 0.40}),   # loss
        ClipScore("c", 1.0, {"majmin": 0.40}),   # loss
    ]
    baseline = [
        ClipScore("a", 10.0, {"majmin": 0.50}),
        ClipScore("b", 1.0, {"majmin": 0.50}),
        ClipScore("c", 1.0, {"majmin": 0.50}),
    ]
    rate, deltas = win_rate(engine, baseline)
    # One long clip carries the weighted mean, but win rate exposes it: only 1/3 clips win.
    assert rate == pytest.approx(1 / 3)
    assert dict(deltas)["a"] == pytest.approx(0.45)


def test_bootstrap_delta_ci_point_matches_weighted_delta_and_is_deterministic():
    engine = [ClipScore("a", 2.0, {"majmin": 0.9}), ClipScore("b", 1.0, {"majmin": 0.6})]
    baseline = [ClipScore("a", 2.0, {"majmin": 0.5}), ClipScore("b", 1.0, {"majmin": 0.5})]
    ci = bootstrap_delta_ci(engine, baseline, n_resamples=500, seed=0)
    # point = duration-weighted mean delta = (2*0.4 + 1*0.1) / 3
    assert ci.point == pytest.approx((2 * 0.4 + 1 * 0.1) / 3)
    assert ci.lo <= ci.point <= ci.hi
    assert ci.n_clips == 2
    # same seed -> identical interval
    again = bootstrap_delta_ci(engine, baseline, n_resamples=500, seed=0)
    assert (again.lo, again.hi) == (ci.lo, ci.hi)


def test_bootstrap_delta_ci_all_wins_keeps_lower_bound_positive():
    engine = [ClipScore(n, 1.0, {"majmin": 0.9}) for n in "abcd"]
    baseline = [ClipScore(n, 1.0, {"majmin": 0.4}) for n in "abcd"]
    ci = bootstrap_delta_ci(engine, baseline, n_resamples=1000, seed=1)
    assert ci.lo > 0.0  # every clip wins by +0.5, so no resample can go non-positive


def test_bootstrap_delta_ci_handles_no_matched_clips():
    ci = bootstrap_delta_ci([], [], n_resamples=100, seed=0)
    assert ci.n_clips == 0 and ci.point == 0.0


# --- scoring proper needs mir_eval (the [ml] extra); gate per-test so the pure tests
#     above still run without it ---


def test_perfect_prediction_scores_one():
    pytest.importorskip("mir_eval")
    ref_i = [(0.0, 1.0), (1.0, 2.0)]
    ref_l = ["C:maj", "G:7"]
    scores = score_labels(ref_i, ref_l, ref_i, ref_l)
    assert scores["majmin"] == pytest.approx(1.0)
    assert scores["root"] == pytest.approx(1.0)


def test_wrong_root_scores_below_one():
    pytest.importorskip("mir_eval")
    ref_i = [(0.0, 1.0), (1.0, 2.0)]
    ref_l = ["C:maj", "G:maj"]
    est_l = ["C:maj", "A:maj"]  # second chord wrong
    scores = score_labels(ref_i, ref_l, ref_i, est_l)
    assert scores["majmin"] == pytest.approx(0.5)
