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


def _seed_three(client, chart_id):
    # At 120 BPM: C=4 beats (2s), F=6 beats (3s), G=2 beats (1s)
    ids = []
    for root, sb, eb in (("C", 0.0, 4.0), ("F", 4.0, 10.0), ("G", 10.0, 12.0)):
        ids.append(
            client.post(
                f"/api/charts/{chart_id}/segments",
                json={"start_beat": sb, "end_beat": eb, "chord_root": root, "chord_quality": "maj"},
            ).json()["id"]
        )
    return ids


def test_reorder_preserves_durations_and_recomputes_times(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    c, f, g = _seed_three(client, chart_id)  # durations 4, 6, 2 beats
    # Move G (last) to the front: order G, C, F
    resp = client.post(f"/api/charts/{chart_id}/reorder", json={"segment_ids": [g, c, f]})
    assert resp.status_code == 200
    segs = resp.json()["segments"]
    assert [s["chord_root"] for s in segs] == ["G", "C", "F"]
    # Contiguous, anchored at 0, each chord keeps its original beat-duration.
    # G=2 beats=1s, C=4 beats=2s, F=6 beats=3s → times (0,1), (1,3), (3,6)
    assert [(s["start_time"], s["end_time"]) for s in segs] == [(0.0, 1.0), (1.0, 3.0), (3.0, 6.0)]


def test_reorder_rejects_non_permutation(client, tmp_path, monkeypatch):
    rec_id, chart_id = _make_chart(client, monkeypatch, tmp_path)
    c, f, g = _seed_three(client, chart_id)
    assert client.post(f"/api/charts/{chart_id}/reorder", json={"segment_ids": [c, f]}).status_code == 422
    assert client.post(
        f"/api/charts/{chart_id}/reorder", json={"segment_ids": [c, f, g, g]}
    ).status_code == 422


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
