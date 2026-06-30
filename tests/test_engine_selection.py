from types import SimpleNamespace

import pytest

import app.jobs as jobs
from app.audio.analyzer import LibrosaAnalyzer


def _settings(engine):
    return SimpleNamespace(
        analysis_engine=engine,
        analysis_sample_rate=22050,
        analysis_min_segment_seconds=0.75,
        analysis_change_penalty=1.0,
        analysis_use_hpss=True,
    )


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
