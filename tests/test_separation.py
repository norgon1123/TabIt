import importlib.util

import pytest

from app.audio.separation import DEFAULT_MODEL, SeparationService

_HAS_DEMUCS = importlib.util.find_spec("demucs") is not None


def test_default_model_is_the_six_source_one():
    assert DEFAULT_MODEL == "htdemucs_6s"


def test_construction_is_cheap_and_lazy():
    # Building the service must not import Demucs or load a model (importable without
    # the [ml] extra), mirroring ChordinoAnalyzer's lazy design.
    svc = SeparationService()
    assert svc._model is None


@pytest.mark.skipif(_HAS_DEMUCS, reason="Demucs installed; the missing-dep path can't be exercised")
def test_separate_without_demucs_gives_clear_error():
    svc = SeparationService()
    with pytest.raises(RuntimeError, match="Demucs"):
        svc.separate("nonexistent.wav")
