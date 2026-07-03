import pytest

from app.audio.device import resolve_device


def test_explicit_device_returned_verbatim():
    assert resolve_device("cpu") == "cpu"
    assert resolve_device("cuda") == "cuda"
    assert resolve_device("mps") == "mps"


def test_case_insensitive():
    assert resolve_device("CPU") == "cpu"


def test_auto_resolves_to_a_valid_backend():
    # Without torch installed this is "cpu"; with torch it may be cuda/mps. Either way
    # it must be a concrete, valid backend — never "auto".
    assert resolve_device("auto") in {"cuda", "mps", "cpu"}


def test_invalid_device_raises():
    with pytest.raises(ValueError):
        resolve_device("tpu")
