import pytest

from app.music_theory import (
    Quality,
    key_prefers_flats,
    note_to_pitch_class,
    pitch_class_to_note,
    roman_numeral,
    tonic_for_pitch_class,
    transpose_key,
    transpose_note,
)


def test_note_to_pitch_class_handles_sharps_and_flats():
    assert note_to_pitch_class("C") == 0
    assert note_to_pitch_class("C#") == 1
    assert note_to_pitch_class("Db") == 1
    assert note_to_pitch_class("B") == 11


def test_note_to_pitch_class_rejects_invalid():
    with pytest.raises(ValueError):
        note_to_pitch_class("H")


def test_pitch_class_to_note_respects_flat_preference():
    assert pitch_class_to_note(1, prefer_flats=False) == "C#"
    assert pitch_class_to_note(1, prefer_flats=True) == "Db"
    assert pitch_class_to_note(0, prefer_flats=True) == "C"


def test_key_prefers_flats():
    assert key_prefers_flats("F", "major") is True
    assert key_prefers_flats("Bb", "major") is True
    assert key_prefers_flats("G", "major") is False
    assert key_prefers_flats("C", "major") is False
    assert key_prefers_flats("C", "minor") is True   # relative of Eb major
    assert key_prefers_flats("A", "minor") is False


def test_transpose_note_wraps_and_spells_for_key():
    assert transpose_note("G", 2, prefer_flats=False) == "A"
    assert transpose_note("A#", 1, prefer_flats=False) == "B"
    assert transpose_note("G", -2, prefer_flats=True) == "F"
    assert transpose_note("C", 1, prefer_flats=True) == "Db"


def test_roman_numeral_major_key_diatonic():
    assert roman_numeral("C", Quality.MAJ, "C", "major") == "I"
    assert roman_numeral("F", Quality.MAJ, "C", "major") == "IV"
    assert roman_numeral("G", Quality.MAJ, "C", "major") == "V"
    assert roman_numeral("A", Quality.MIN, "C", "major") == "vi"
    assert roman_numeral("D", Quality.MIN, "C", "major") == "ii"


def test_roman_numeral_sevenths_get_suffix():
    assert roman_numeral("G", Quality.DOM7, "C", "major") == "V7"
    assert roman_numeral("C", Quality.MAJ7, "C", "major") == "Imaj7"
    assert roman_numeral("D", Quality.MIN7, "C", "major") == "ii7"


def test_roman_numeral_non_diatonic_gets_accidental():
    assert roman_numeral("Eb", Quality.MAJ, "C", "major") == "bIII"
    assert roman_numeral("Bb", Quality.MAJ, "C", "major") == "bVII"


def test_roman_numeral_minor_key():
    assert roman_numeral("A", Quality.MIN, "A", "minor") == "i"
    assert roman_numeral("C", Quality.MAJ, "A", "minor") == "III"
    assert roman_numeral("E", Quality.MIN, "A", "minor") == "v"
    assert roman_numeral("D", Quality.MIN, "A", "minor") == "iv"


def test_transpose_key_uses_conventional_spelling():
    assert transpose_key("C", "major", 2) == "D"
    assert transpose_key("C", "major", -2) == "Bb"   # conventional, not A#
    assert transpose_key("C", "major", 3) == "Eb"
    assert transpose_key("C", "major", 5) == "F"
    assert transpose_key("A", "minor", 3) == "C"
    assert transpose_key("A", "minor", -2) == "G"


def test_tonic_for_pitch_class_major_uses_conventional_flats():
    assert tonic_for_pitch_class(10, "major") == "Bb"
    assert tonic_for_pitch_class(6, "major") == "Gb"


def test_tonic_for_pitch_class_minor_uses_conventional_sharps():
    assert tonic_for_pitch_class(6, "minor") == "F#"
    assert tonic_for_pitch_class(8, "minor") == "G#"


def test_tonic_for_pitch_class_wraps_octave():
    assert tonic_for_pitch_class(12, "major") == "C"
