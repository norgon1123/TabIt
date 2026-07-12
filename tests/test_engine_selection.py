from types import SimpleNamespace

import pytest

import app.jobs as jobs
from app.audio.analyzer import BTCAnalyzer, LibrosaAnalyzer


def _settings(engine, **overrides):
    base = dict(
        analysis_engine=engine,
        analysis_sample_rate=22050,
        analysis_min_segment_seconds=0.75,
        analysis_change_penalty=1.0,
        analysis_use_hpss=True,
        analysis_device="cpu",
        enable_separation=False,
        separation_model="htdemucs_6s",
        separation_stems="harmonic",
    )
    return SimpleNamespace(**{**base, **overrides})


def test_librosa_engine_selected():
    assert isinstance(jobs._build_analyzer(_settings("librosa")), LibrosaAnalyzer)


def test_chordino_falls_back_to_librosa_when_unavailable(monkeypatch, caplog):
    def boom(*args, **kwargs):
        raise RuntimeError("nnls-chroma:chordino not found")

    monkeypatch.setattr(jobs, "ChordinoAnalyzer", boom)
    with caplog.at_level("WARNING"):
        analyzer = jobs._build_analyzer(_settings("chordino"))
    assert isinstance(analyzer, LibrosaAnalyzer)
    assert any("falling back to librosa" in r.message for r in caplog.records)


def test_chordino_engine_selected_when_available():
    vamp = pytest.importorskip("vamp")
    if "nnls-chroma:chordino" not in vamp.list_plugins():
        pytest.skip("nnls-chroma:chordino Vamp plugin not installed")
    from app.audio.analyzer import ChordinoAnalyzer

    assert isinstance(jobs._build_analyzer(_settings("chordino")), ChordinoAnalyzer)


@pytest.mark.parametrize("engine", ["btc", "BTC", "deep"])
def test_btc_engine_selected_without_separation(engine):
    # Selection must not need torch/Demucs/weights present: everything loads lazily on the
    # first analyze(), so the engine can be swapped in on a box that only later gets [ml].
    analyzer = jobs._build_analyzer(_settings(engine))
    assert isinstance(analyzer, BTCAnalyzer)
    assert analyzer._separator is None
    assert analyzer.engine_version == "btc-v1"


def test_btc_engine_with_separation_gets_a_separator():
    analyzer = jobs._build_analyzer(
        _settings("btc", enable_separation=True, separation_stems="accomp")
    )
    assert isinstance(analyzer, BTCAnalyzer)
    assert analyzer._separator is not None
    assert analyzer._separator._model is None  # still lazy — no Demucs import at build time
    assert analyzer.engine_version == "btc-v1+demucs-accomp"
