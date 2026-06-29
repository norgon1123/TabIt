import numpy as np
import pytest

from app.audio.key_estimation import _MAJOR_PROFILE, _MINOR_PROFILE, estimate_key


def test_detects_c_major():
    assert estimate_key(_MAJOR_PROFILE.copy()) == (0, "major")


def test_detects_g_major():
    assert estimate_key(np.roll(_MAJOR_PROFILE, 7)) == (7, "major")


def test_detects_a_minor():
    assert estimate_key(np.roll(_MINOR_PROFILE, 9)) == (9, "minor")


def test_constant_chroma_defaults_to_c_major():
    assert estimate_key(np.ones(12)) == (0, "major")


def test_rejects_wrong_length():
    with pytest.raises(ValueError):
        estimate_key(np.zeros(11))
