import io

import pytest


def _register(client, username="alice"):
    client.post("/api/auth/register", json={"username": username, "password": "password123"})


def _upload(client, duration=10.0):
    return client.post(
        "/api/recordings",
        files={"file": ("memo.m4a", io.BytesIO(b"fake"), "audio/mp4")},
        data={"duration_seconds": str(duration)},
    ).json()["id"]


def _make_chart(client, monkeypatch, tmp_path):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client)
    resp = client.post(f"/api/recordings/{rec_id}/chart", json={"key_tonic": "C", "key_mode": "major"})
    assert resp.status_code == 201
    return rec_id, resp.json()["id"]


def test_create_and_get_chart(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    chart = client.get(f"/api/recordings/{rec_id}/chart").json()
    assert chart["key_tonic"] == "C"
    assert chart["segments"] == []


def test_add_segment_computes_roman_and_seconds(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration=10.0
    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "G", "chord_quality": "dom7"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["roman_numeral"] == "V7"
    # No analysis -> synthesized 120 BPM grid (0.5s/beat): 4 beats == 2.0s.
    assert body["start_time"] == pytest.approx(0.0)
    assert body["end_time"] == pytest.approx(2.0)


def test_add_overlapping_segment_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    client.post(f"/api/charts/{chart_id}/segments",
                json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"})
    resp = client.post(f"/api/charts/{chart_id}/segments",
                       json={"start_beat": 2.0, "end_beat": 6.0, "chord_root": "F", "chord_quality": "maj"})
    assert resp.status_code == 422


def test_segment_beyond_grid_rejected(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration 10s -> 20 beats
    resp = client.post(f"/api/charts/{chart_id}/segments",
                       json={"start_beat": 0.0, "end_beat": 999.0, "chord_root": "C", "chord_quality": "maj"})
    assert resp.status_code == 422


def test_update_segment_chord(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    seg_id = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"},
    ).json()["id"]
    resp = client.patch(
        f"/api/charts/{chart_id}/segments/{seg_id}",
        json={"chord_root": "A", "chord_quality": "min"},
    )
    assert resp.status_code == 200
    assert resp.json()["roman_numeral"] == "vi"


def test_delete_segment(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    seg_id = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"},
    ).json()["id"]
    assert client.delete(f"/api/charts/{chart_id}/segments/{seg_id}").status_code == 204
    assert client.get(f"/api/recordings/{rec_id}/chart").json()["segments"] == []


def test_transpose_shifts_key_and_chords_but_keeps_numerals(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    # At synthesized 120 BPM (0.5s/beat): 4 beats = 2s, keep segments non-overlapping
    for root, sb, eb in (("C", 0.0, 4.0), ("F", 4.0, 8.0), ("G", 8.0, 12.0)):
        client.post(
            f"/api/charts/{chart_id}/segments",
            json={"start_beat": sb, "end_beat": eb, "chord_root": root, "chord_quality": "maj"},
        )
    resp = client.post(f"/api/charts/{chart_id}/transpose", json={"semitones": 2})
    assert resp.status_code == 200
    chart = resp.json()
    assert chart["key_tonic"] == "D"
    roots = [s["chord_root"] for s in chart["segments"]]
    numerals = [s["roman_numeral"] for s in chart["segments"]]
    assert roots == ["D", "G", "A"]
    assert numerals == ["I", "IV", "V"]


def test_chart_access_scoped_to_owner(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    client.post("/api/auth/logout")
    _register(client, "intruder")
    assert client.get(f"/api/recordings/{rec_id}/chart").status_code == 404
    assert client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 2.0, "chord_root": "C", "chord_quality": "maj"},
    ).status_code == 404


def test_transpose_into_flat_key_uses_flat_spelling(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # C major
    client.post(f"/api/charts/{chart_id}/segments",
                json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"})
    client.post(f"/api/charts/{chart_id}/segments",
                json={"start_beat": 4.0, "end_beat": 8.0, "chord_root": "A", "chord_quality": "min"})
    chart = client.post(f"/api/charts/{chart_id}/transpose", json={"semitones": -2}).json()
    assert chart["key_tonic"] == "Bb"
    assert [s["chord_root"] for s in chart["segments"]] == ["Bb", "G"]
    assert [s["roman_numeral"] for s in chart["segments"]] == ["I", "vi"]


def test_update_chart_settings(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    resp = client.patch(f"/api/charts/{chart_id}/settings",
                        json={"beats_per_measure": 3, "measure_offset": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["beats_per_measure"] == 3
    assert body["measure_offset"] == 1


def test_correcting_key_rewrites_numerals_but_not_chords(client, tmp_path, monkeypatch):
    """The mirror image of /transpose: chords stay put, numerals move."""
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # C major
    for root, sb, eb in (("C", 0.0, 4.0), ("F", 4.0, 8.0), ("G", 8.0, 12.0)):
        client.post(
            f"/api/charts/{chart_id}/segments",
            json={"start_beat": sb, "end_beat": eb, "chord_root": root, "chord_quality": "maj"},
        )
    resp = client.patch(
        f"/api/charts/{chart_id}/settings", json={"key_tonic": "G", "key_mode": "major"}
    )
    assert resp.status_code == 200
    chart = resp.json()
    assert (chart["key_tonic"], chart["key_mode"]) == ("G", "major")
    assert [s["chord_root"] for s in chart["segments"]] == ["C", "F", "G"]
    assert [s["chord_quality"] for s in chart["segments"]] == ["maj", "maj", "maj"]
    assert [s["roman_numeral"] for s in chart["segments"]] == ["IV", "bVII", "I"]
    # Persisted, not just echoed back.
    assert client.get(f"/api/recordings/{rec_id}/chart").json()["key_tonic"] == "G"


def test_correcting_key_mode_alone_rewrites_numerals(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # C major
    client.post(f"/api/charts/{chart_id}/segments",
                json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "Eb", "chord_quality": "maj"})
    chart = client.patch(f"/api/charts/{chart_id}/settings", json={"key_mode": "minor"}).json()
    assert (chart["key_tonic"], chart["key_mode"]) == ("C", "minor")
    seg = chart["segments"][0]
    assert seg["chord_root"] == "Eb"          # bIII in C major...
    assert seg["roman_numeral"] == "III"      # ...is the diatonic III in C minor


@pytest.mark.parametrize(
    "payload",
    [{"key_tonic": "H"}, {"key_tonic": "Cbb"}, {"key_mode": "dorian"}, {"key_mode": "Major"}],
)
def test_invalid_key_correction_rejected(client, tmp_path, monkeypatch, payload):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    assert client.patch(f"/api/charts/{chart_id}/settings", json=payload).status_code == 422
    assert client.get(f"/api/recordings/{rec_id}/chart").json()["key_tonic"] == "C"


def test_add_segment_on_null_duration_chart(client, db_session, tmp_path, monkeypatch):
    """Segments must be addable even when recording.duration_seconds is NULL (regression)."""
    from sqlalchemy import select as sa_select

    from app.models import Recording

    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client)

    # Simulate a recording whose duration is not yet known.
    rec = db_session.execute(sa_select(Recording).where(Recording.id == rec_id)).scalar_one()
    rec.duration_seconds = None
    db_session.commit()

    resp = client.post(
        f"/api/recordings/{rec_id}/chart", json={"key_tonic": "C", "key_mode": "major"}
    )
    assert resp.status_code == 201
    chart_id = resp.json()["id"]

    resp = client.post(
        f"/api/charts/{chart_id}/segments",
        json={"start_beat": 0.0, "end_beat": 4.0, "chord_root": "C", "chord_quality": "maj"},
    )
    assert resp.status_code == 201


def _three_segments(client, chart_id):
    ids = []
    for root, sb, eb in (("C", 0.0, 4.0), ("F", 4.0, 8.0), ("G", 8.0, 12.0)):
        ids.append(client.post(
            f"/api/charts/{chart_id}/segments",
            json={"start_beat": sb, "end_beat": eb, "chord_root": root, "chord_quality": "maj"},
        ).json()["id"])
    return ids


def test_batch_resize_applies_redistributed_windows(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # duration 10s -> 20 beats
    a, b, c = _three_segments(client, chart_id)
    # Grow A to 6 by taking 2 from B — the single-PATCH path would 422 on overlap.
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": a, "start_beat": 0.0, "end_beat": 6.0},
        {"id": b, "start_beat": 6.0, "end_beat": 8.0},
    ]})
    assert resp.status_code == 200
    spans = {s["chord_root"]: (s["start_beat"], s["end_beat"]) for s in resp.json()["segments"]}
    assert spans["C"] == (0.0, 6.0)
    assert spans["F"] == (6.0, 8.0)
    assert spans["G"] == (8.0, 12.0)


def test_batch_resize_rejects_overlapping_final_state_atomically(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    a, b, c = _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": a, "start_beat": 0.0, "end_beat": 6.0},  # overlaps B, which is unchanged
    ]})
    assert resp.status_code == 422
    # Nothing committed.
    spans = {s["chord_root"]: s["end_beat"] for s in client.get(f"/api/recordings/{rec_id}/chart").json()["segments"]}
    assert spans["C"] == 4.0


def test_batch_resize_rejects_beyond_grid(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)  # 20 beats max
    a, b, c = _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": c, "start_beat": 8.0, "end_beat": 999.0},
    ]})
    assert resp.status_code == 422


def test_batch_resize_unknown_segment_404(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    _three_segments(client, chart_id)
    resp = client.patch(f"/api/charts/{chart_id}/segments", json={"segments": [
        {"id": "nope", "start_beat": 0.0, "end_beat": 2.0},
    ]})
    assert resp.status_code == 404
