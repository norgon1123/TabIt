import numpy as np
import pytest

from app.audio.decode import decode_to_mono, ffmpeg_available

pytestmark = pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not installed")


def test_decodes_wav_to_mono_float32(tmp_path):
    sf = pytest.importorskip("soundfile")
    sr = 22050
    t = np.linspace(0.0, 1.0, sr, endpoint=False)
    tone = 0.5 * np.sin(2 * np.pi * 440 * t)
    path = tmp_path / "tone.wav"
    sf.write(str(path), tone, sr)

    out = decode_to_mono(str(path), sr)

    assert out.dtype == np.float32
    assert abs(len(out) - sr) < sr * 0.1  # ~1 second of samples
    assert np.isfinite(out).all()


def test_raises_on_undecodable_input(tmp_path):
    bad = tmp_path / "bad.m4a"
    bad.write_bytes(b"not actually audio")
    with pytest.raises(RuntimeError):
        decode_to_mono(str(bad), 22050)
