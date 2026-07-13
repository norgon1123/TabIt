# Chord evaluation set (Phase 0, spike 0.1)

Ground-truth clips the go/no-go gate is measured against. Nothing else in Phase 0 can be
judged without this, so it comes first.

## Layout

One pair per clip, sharing a basename:

    tests/eval/
      solo-guitar-01.m4a     # or .wav/.flac/.mp3/.ogg
      solo-guitar-01.lab
      piano-ballad-02.wav
      piano-ballad-02.lab
      ...

Audio files are **not committed** (they're large and may be personal recordings) — drop
them in locally. Only the `.lab` files and this README are tracked.

## `.lab` format (MIREX)

One chord segment per line, `start end label` (seconds), `N` for no-chord:

    0.000   1.850   C:maj
    1.850   3.700   A:min
    3.700   5.500   F:maj
    5.500   7.200   G:7

Labels use `mir_eval` chord syntax (`C:maj`, `A:min7`, `G:7`, `D:maj7`, `N`). Times are
millisecond precision.

## Building it

Target ~15–30 clips, ~20–40 s each, covering what Tabit actually gets: solo guitar, solo
piano, and a few small multi-instrument recordings — include some messy practice-voice-memo
cases. Then:

    # 1. get a starter .lab from an existing engine (chordino is far closer to truth
    #    than librosa, so there's much less to correct — needs the nnls-chroma Vamp plugin)
    python scripts/bootstrap_labels.py tests/eval/solo-guitar-01.m4a --engine chordino
    # 2. CORRECT it by ear (or in Tabit's editor) until it's true ground truth
    # 3. check the labels parse and don't overlap before scoring
    python scripts/validate_labels.py
    # 4. score an engine against the whole set
    python scripts/eval_chords.py --dataset tests/eval --engine librosa --baseline chordino

The starter labels are only a scaffold — the accuracy numbers are meaningless unless the
`.lab` files are corrected to reflect the real chords. A `:` typed for a `.` in a time
field, or a segment that overlaps the next, will crash the eval run; `validate_labels.py`
catches both with a `file:line` location.
