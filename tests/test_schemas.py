import pytest
from pydantic import ValidationError

from app.schemas import AnalysisOut, ChartSettingsUpdate, SegmentCreate, SegmentOut, TempoUpdate


def test_segment_create_uses_beats():
    s = SegmentCreate(start_beat=0.0, end_beat=4.0, chord_root="C", chord_quality="maj")
    assert s.start_beat == 0.0 and s.end_beat == 4.0


def test_segment_create_rejects_negative_beat():
    with pytest.raises(ValidationError):
        SegmentCreate(start_beat=-1.0, end_beat=4.0, chord_root="C", chord_quality="maj")


def test_segment_out_carries_beats_and_seconds():
    out = SegmentOut(id="x", start_beat=0.0, end_beat=4.0, start_time=0.0, end_time=2.0,
                     chord_root="C", chord_quality="maj", roman_numeral="I")
    assert out.start_beat == 0.0 and out.end_time == 2.0


def test_chart_settings_update_validates_measure():
    with pytest.raises(ValidationError):
        ChartSettingsUpdate(beats_per_measure=0)


def test_analysis_out_reports_a_fractional_tempo_as_a_whole_number():
    # Analyses recorded before tempo was whole still hold the tracker's raw estimate;
    # 143.6 BPM is not a count a player can use, so it never leaves the API.
    out = AnalysisOut.model_validate(
        {"status": "done", "bpm": 143.6, "detected_key_tonic": "B", "detected_key_mode": "minor",
         "engine_version": "hmm-v3", "error": None, "beat_times": []}
    )
    assert out.bpm == 144


def test_tempo_update_rounds_rather_than_rejecting():
    assert TempoUpdate(bpm=71.8).bpm == 72


def test_tempo_update_range_checks_the_rounded_tempo():
    with pytest.raises(ValidationError):
        TempoUpdate(bpm=20.4)  # rounds to 20, which is below the countable range
