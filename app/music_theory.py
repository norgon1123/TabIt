"""Pure music-theory functions. No I/O, no framework dependencies."""

from enum import StrEnum


class Quality(StrEnum):
    MAJ = "maj"
    MIN = "min"
    DOM7 = "dom7"
    MAJ7 = "maj7"
    MIN7 = "min7"


_NOTE_TO_PC = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
    "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
}
_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Tonics (by name) whose key signatures use flats.
_MAJOR_FLAT_TONICS = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"}
_MINOR_FLAT_TONICS = {"D", "G", "C", "F", "Bb", "Eb", "Ab"}

# Semitone offset from tonic -> roman base (uppercase, with accidental prefix).
_MAJOR_DEGREES = {
    0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV",
    6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII",
}
_MINOR_DEGREES = {
    0: "I", 1: "bII", 2: "II", 3: "III", 4: "#III", 5: "IV",
    6: "#IV", 7: "V", 8: "VI", 9: "#VI", 10: "VII", 11: "#VII",
}

_UPPERCASE_QUALITIES = {Quality.MAJ, Quality.DOM7, Quality.MAJ7}
_SUFFIX = {
    Quality.MAJ: "", Quality.MIN: "", Quality.DOM7: "7",
    Quality.MAJ7: "maj7", Quality.MIN7: "7",
}


def note_to_pitch_class(note: str) -> int:
    try:
        return _NOTE_TO_PC[note]
    except KeyError as exc:
        raise ValueError(f"Unknown note name: {note!r}") from exc


def pitch_class_to_note(pc: int, *, prefer_flats: bool) -> str:
    names = _FLAT_NAMES if prefer_flats else _SHARP_NAMES
    return names[pc % 12]


def key_prefers_flats(tonic: str, mode: str) -> bool:
    if mode == "major":
        return tonic in _MAJOR_FLAT_TONICS
    return tonic in _MINOR_FLAT_TONICS


# Conventional tonic spelling per pitch class, by mode.
_PREFERRED_MAJOR_TONIC = {
    0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F",
    6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B",
}
_PREFERRED_MINOR_TONIC = {
    0: "C", 1: "C#", 2: "D", 3: "Eb", 4: "E", 5: "F",
    6: "F#", 7: "G", 8: "G#", 9: "A", 10: "Bb", 11: "B",
}


def transpose_key(tonic: str, mode: str, semitones: int) -> str:
    """Transpose a key center, returning the conventional tonic spelling."""
    pc = (note_to_pitch_class(tonic) + semitones) % 12
    table = _PREFERRED_MAJOR_TONIC if mode == "major" else _PREFERRED_MINOR_TONIC
    return table[pc]


def transpose_note(note: str, semitones: int, *, prefer_flats: bool) -> str:
    pc = (note_to_pitch_class(note) + semitones) % 12
    return pitch_class_to_note(pc, prefer_flats=prefer_flats)


def roman_numeral(root: str, quality: Quality, key_tonic: str, key_mode: str) -> str:
    offset = (note_to_pitch_class(root) - note_to_pitch_class(key_tonic)) % 12
    degrees = _MAJOR_DEGREES if key_mode == "major" else _MINOR_DEGREES
    base = degrees[offset]
    accidental = base[:-_numeral_len(base)] if _has_accidental(base) else ""
    numeral = base[len(accidental):]
    if quality not in _UPPERCASE_QUALITIES:
        numeral = numeral.lower()
    return f"{accidental}{numeral}{_SUFFIX[quality]}"


def _has_accidental(base: str) -> bool:
    return base[0] in ("#", "b")


def _numeral_len(base: str) -> int:
    return len(base) - 1 if _has_accidental(base) else len(base)


def tonic_for_pitch_class(pc: int, mode: str) -> str:
    """Conventional tonic spelling for a pitch class in the given mode."""
    table = _PREFERRED_MAJOR_TONIC if mode == "major" else _PREFERRED_MINOR_TONIC
    return table[pc % 12]
