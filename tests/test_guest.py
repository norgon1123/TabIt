"""Account-free analysis: the same chord sheet, none of the storage.

The promises under test: a logged-out visitor can upload and edit a chart; their audio is
deleted the moment analysis ends; nothing about them is written to the database; they hold
one song at a time; and one guest can never reach another's.
"""

import io
from pathlib import Path

import pytest

from app.audio.analyzer import AnalysisResult
from app.audio.segments import DetectedSegment
from app.guest import GuestRecording, GuestStore, get_guest_store
from app.jobs import analyze_guest_recording, get_job_dispatcher
from app.main import app
from app.models import Analysis, ChordChart, ChordSegment, Recording
from app.music_theory import Quality


class StubAnalyzer:
    def __init__(self, result=None, exc=None):
        self._result = result
        self._exc = exc
        self.saw_audio: bytes | None = None

    def analyze(self, audio_path):
        # Read the file the way a real analyzer would: it must still exist *during* the job.
        self.saw_audio = Path(audio_path).read_bytes()
        if self._exc is not None:
            raise self._exc
        return self._result


class InlineDispatcher:
    """Runs the guest job synchronously, so a test sees the finished state on return."""

    def __init__(self, analyzer):
        self.analyzer = analyzer
        self.dispatched: list[str] = []

    def dispatch(self, recording_id: str) -> None:
        self.dispatched.append(recording_id)

    def dispatch_guest(self, recording: GuestRecording) -> None:
        analyze_guest_recording(recording, self.analyzer)

    def shutdown(self) -> None:
        pass


def _result(duration=4.0):
    return AnalysisResult(
        bpm=120.0,
        key_tonic_pc=0,
        key_mode="major",
        duration=duration,
        segments=[
            DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
            DetectedSegment(2.0, 4.0, 7, Quality.MAJ),
        ],
        engine_version="template-v1",
    )


def _upload(client, name="memo.wav", duration=10.0, content=b"fake-audio-bytes"):
    return client.post(
        "/api/recordings",
        files={"file": (name, io.BytesIO(content), "audio/wav")},
        data={"duration_seconds": str(duration)},
    )


@pytest.fixture
def analyzed(client, tmp_path, monkeypatch):
    """A guest who has uploaded a song and had it analyzed. Yields (client, recording, stub)."""
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    stub = StubAnalyzer(result=_result())
    app.dependency_overrides[get_job_dispatcher] = lambda: InlineDispatcher(stub)
    resp = _upload(client)
    assert resp.status_code == 201, resp.text
    yield client, resp.json(), stub
    app.dependency_overrides.pop(get_job_dispatcher, None)


def test_guest_can_upload_without_an_account(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    stub = StubAnalyzer(result=_result())
    app.dependency_overrides[get_job_dispatcher] = lambda: InlineDispatcher(stub)

    resp = _upload(client)

    assert resp.status_code == 201
    assert resp.json()["original_filename"] == "memo.wav"
    assert "tabit_guest" in resp.cookies  # the cookie that names their one slot
    app.dependency_overrides.pop(get_job_dispatcher, None)


def test_guest_analysis_produces_a_chart(analyzed):
    client, rec, _ = analyzed

    assert client.get(f"/api/recordings/{rec['id']}").json()["analysis"]["status"] == "done"

    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    assert chart["key_tonic"] == "C"
    assert [(s["chord_root"], s["chord_quality"]) for s in chart["segments"]] == [
        ("C", "maj"),
        ("G", "maj"),
    ]
    # Derived seconds come back exactly as they do for a signed-in user.
    assert chart["segments"][0]["start_time"] == 0.0


def test_guest_audio_is_deleted_when_processing_completes(analyzed, tmp_path):
    client, rec, stub = analyzed

    assert stub.saw_audio == b"fake-audio-bytes"  # the analyzer did get to read it...
    assert list((tmp_path / "_guest").glob("*")) == []  # ...and nothing is left behind
    assert client.get(f"/api/recordings/{rec['id']}/audio").status_code == 404


def test_guest_audio_is_deleted_even_when_analysis_fails(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    stub = StubAnalyzer(exc=RuntimeError("ffmpeg exploded"))
    app.dependency_overrides[get_job_dispatcher] = lambda: InlineDispatcher(stub)

    rec = _upload(client).json()

    analysis = client.get(f"/api/recordings/{rec['id']}/analysis").json()
    assert analysis["status"] == "failed"
    assert "ffmpeg exploded" in analysis["error"]
    assert list((tmp_path / "_guest").glob("*")) == []
    app.dependency_overrides.pop(get_job_dispatcher, None)


def test_guest_song_never_reaches_the_database(analyzed, db_session):
    client, rec, _ = analyzed

    # Edit the chart the way the chord sheet does, then check the DB is still untouched.
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    client.post(f"/api/charts/{chart['id']}/transpose", json={"semitones": 2})

    assert db_session.query(Recording).count() == 0
    assert db_session.query(Analysis).count() == 0
    assert db_session.query(ChordChart).count() == 0
    assert db_session.query(ChordSegment).count() == 0


def test_guest_can_edit_the_chart_like_a_signed_in_user(analyzed):
    client, rec, _ = analyzed
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    cid, first = chart["id"], chart["segments"][0]

    assert client.patch(
        f"/api/charts/{cid}/segments/{first['id']}", json={"chord_quality": "min7"}
    ).status_code == 200
    assert client.post(f"/api/charts/{cid}/transpose", json={"semitones": 2}).status_code == 200
    assert client.patch(
        f"/api/charts/{cid}/settings", json={"beats_per_measure": 3}
    ).status_code == 200

    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    assert chart["key_tonic"] == "D"
    assert chart["beats_per_measure"] == 3
    assert chart["segments"][0]["chord_quality"] == "min7"
    assert chart["segments"][0]["chord_root"] == "D"  # transposed with the key


def test_guest_can_recount_the_tempo(analyzed):
    """Setting the BPM re-indexes the grid and rescales every segment — in memory, same as
    it does in the DB for a signed-in user."""
    client, rec, _ = analyzed
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    assert chart["bpm"] == 120.0
    before = [(s["start_time"], s["end_time"]) for s in chart["segments"]]

    resp = client.patch(f"/api/charts/{chart['id']}/tempo", json={"bpm": 60})

    assert resp.status_code == 200, resp.text
    after = resp.json()
    assert after["bpm"] == 60.0
    # Halving the tempo halves the beat count of each chord without moving it in time.
    assert [(s["start_beat"], s["end_beat"]) for s in after["segments"]] == [(0.0, 2.0), (2.0, 4.0)]
    assert [(s["start_time"], s["end_time"]) for s in after["segments"]] == before


def test_guest_chart_edits_are_bounded_by_the_recording_duration(analyzed):
    client, rec, _ = analyzed
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()

    resp = client.post(
        f"/api/charts/{chart['id']}/segments",
        json={"start_beat": 8.0, "end_beat": 400.0, "chord_root": "C", "chord_quality": "maj"},
    )

    assert resp.status_code == 422
    assert "beat grid" in resp.json()["detail"]


def test_guest_segments_can_be_added_and_deleted(analyzed):
    client, rec, _ = analyzed
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()
    cid = chart["id"]
    # The seeded chart covers the whole grid, so free up the second half before adding.
    assert client.delete(f"/api/charts/{cid}/segments/{chart['segments'][1]['id']}").status_code == 204

    added = client.post(
        f"/api/charts/{cid}/segments",
        json={"start_beat": 4.0, "end_beat": 6.0, "chord_root": "F", "chord_quality": "maj"},
    )
    assert added.status_code == 201
    assert [s["chord_root"] for s in client.get(f"/api/recordings/{rec['id']}/chart").json()["segments"]] == [
        "C",
        "F",
    ]

    assert client.delete(f"/api/charts/{cid}/segments/{added.json()['id']}").status_code == 204
    remaining = client.get(f"/api/recordings/{rec['id']}/chart").json()["segments"]
    assert [s["chord_root"] for s in remaining] == ["C"]


def test_guest_replacing_a_finished_song_keeps_only_the_new_one(analyzed):
    client, first, _ = analyzed

    second = _upload(client, name="other.wav")

    assert second.status_code == 201
    assert second.json()["id"] != first["id"]
    # One song at a time: the previous one is gone, not merely hidden.
    assert client.get(f"/api/recordings/{first['id']}").status_code == 404
    assert client.get(f"/api/recordings/{second.json()['id']}").status_code == 200


def test_guest_cannot_start_a_second_analysis_while_one_is_running(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    # The default fake dispatcher never runs the job, so the first upload stays "pending".
    first = _upload(client)
    assert first.status_code == 201

    second = _upload(client, name="other.wav")

    assert second.status_code == 409
    assert "one song at a time" in second.json()["detail"]
    assert client.get(f"/api/recordings/{first.json()['id']}").status_code == 200


def test_one_guest_cannot_reach_anothers_recording(analyzed, tmp_path, monkeypatch):
    client, rec, _ = analyzed
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    chart = client.get(f"/api/recordings/{rec['id']}/chart").json()

    client.cookies.clear()  # a different browser: no guest cookie
    stranger = _upload(client, name="stranger.wav")  # ...which mints a *different* guest

    assert stranger.status_code == 201
    assert client.get(f"/api/recordings/{rec['id']}").status_code == 404
    assert client.get(f"/api/recordings/{rec['id']}/chart").status_code == 404
    assert client.post(f"/api/charts/{chart['id']}/transpose", json={"semitones": 2}).status_code == 404


def test_guest_reanalyze_is_refused_because_the_audio_is_gone(analyzed):
    client, rec, _ = analyzed

    resp = client.post(f"/api/recordings/{rec['id']}/analyze")

    assert resp.status_code == 409
    assert "upload the file again" in resp.json()["detail"]


def test_guest_delete_drops_the_song_immediately(analyzed):
    client, rec, _ = analyzed

    assert client.delete(f"/api/recordings/{rec['id']}").status_code == 204
    assert client.get(f"/api/recordings/{rec['id']}").status_code == 404
    assert len(get_guest_store()) == 0


def test_guest_has_no_library(client):
    # The list endpoint is the account's payoff; a guest is simply not signed in.
    assert client.get("/api/recordings").status_code == 401


def test_anonymous_request_without_any_cookie_is_unauthorized(client):
    assert client.get("/api/recordings/whatever").status_code == 401


def test_uploading_over_the_length_limit_is_still_refused_for_guests(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))

    resp = _upload(client, duration=10 * 60 + 1)

    assert resp.status_code == 413
    assert len(get_guest_store()) == 0
    assert not (tmp_path / "_guest").exists() or list((tmp_path / "_guest").glob("*")) == []


def test_expired_guest_entries_are_purged_with_their_audio(tmp_path):
    store = GuestStore(ttl_seconds=0)  # everything is instantly stale
    audio = tmp_path / "leftover.wav"
    audio.write_bytes(b"x")
    rec = GuestRecording(original_filename="a.wav", format="wav", stored_path=str(audio))
    store.put("key", rec)

    assert store.get("key") is None
    assert not audio.exists()
    assert len(store) == 0
