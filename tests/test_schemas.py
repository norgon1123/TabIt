import pytest
from pydantic import ValidationError

from app.schemas import ChartSettingsUpdate, SegmentCreate, SegmentOut


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
