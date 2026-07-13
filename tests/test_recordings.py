import io
import shutil
import wave

import pytest

needs_ffprobe = pytest.mark.skipif(
    shutil.which("ffprobe") is None, reason="ffprobe not on PATH"
)


def _register(client, username="alice"):
    client.post("/api/auth/register", json={"username": username, "password": "password123"})


def _upload(client, name="memo.m4a", duration=10.0, content=b"fake-audio-bytes"):
    return client.post(
        "/api/recordings",
        files={"file": (name, io.BytesIO(content), "audio/mp4")},
        data={"duration_seconds": str(duration)},
    )


def _wav_bytes(seconds: float, rate: int = 4000) -> bytes:
    """A real, ffprobe-readable WAV of the given length (silence)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


def test_upload_creates_recording(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    resp = _upload(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["original_filename"] == "memo.m4a"
    assert body["format"] == "m4a"
    assert body["duration_seconds"] == 10.0
    assert body["status"] == "uploaded"


def test_upload_without_an_account_is_a_guest_upload(client, tmp_path, monkeypatch):
    """Uploading logged-out no longer 401s — it starts a guest analysis, which owns no row.

    The rest of that path is tests/test_guest.py; what matters here is that it stays out of
    the recordings table.
    """
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))

    resp = _upload(client)

    assert resp.status_code == 201
    assert client.get("/api/recordings").status_code == 401  # still no library without login


def test_upload_rejects_recording_longer_than_ten_minutes(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    resp = _upload(client, duration=10 * 60 + 1)
    assert resp.status_code == 413
    assert "10 minutes" in resp.json()["detail"]
    assert client.get("/api/recordings").json() == []  # nothing persisted


def test_upload_allows_recording_at_the_ten_minute_limit(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    assert _upload(client, duration=10 * 60).status_code == 201


@needs_ffprobe
def test_upload_rejects_long_file_when_client_under_reports_duration(client, tmp_path, monkeypatch):
    """The browser-reported duration is untrusted: ffprobe the stored file and reject on that."""
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    monkeypatch.setenv("TABIT_MAX_RECORDING_SECONDS", "1")
    _register(client)

    resp = _upload(client, name="long.wav", duration=0.5, content=_wav_bytes(2.0))
    assert resp.status_code == 413
    assert client.get("/api/recordings").json() == []
    assert list(tmp_path.rglob("*.wav")) == []  # the stored file is cleaned up too


@needs_ffprobe
def test_upload_stores_the_server_probed_duration(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)

    body = _upload(client, name="short.wav", duration=99.0, content=_wav_bytes(2.0)).json()
    assert body["duration_seconds"] == pytest.approx(2.0, abs=0.05)  # not the client's 99


def test_recording_payload_includes_created_at(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    body = _upload(client).json()
    assert "created_at" in body and body["created_at"]


def test_rename_recording(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    resp = client.patch(f"/api/recordings/{rec_id}", json={"original_filename": "Verse idea.m4a"})
    assert resp.status_code == 200
    assert resp.json()["original_filename"] == "Verse idea.m4a"
    assert client.get(f"/api/recordings/{rec_id}").json()["original_filename"] == "Verse idea.m4a"


def test_rename_allows_duplicate_names(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    a = _upload(client, "a.m4a").json()["id"]
    b = _upload(client, "b.m4a").json()["id"]
    client.patch(f"/api/recordings/{a}", json={"original_filename": "same.m4a"})
    resp = client.patch(f"/api/recordings/{b}", json={"original_filename": "same.m4a"})
    assert resp.status_code == 200


def test_rename_rejects_empty_name(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    assert client.patch(f"/api/recordings/{rec_id}", json={"original_filename": ""}).status_code == 422


def test_rename_other_users_recording_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.patch(f"/api/recordings/{rec_id}", json={"original_filename": "x"}).status_code == 404


def test_list_only_returns_own_recordings(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    _upload(client, "a.m4a")
    client.post("/api/auth/logout")
    _register(client, "bob")
    _upload(client, "b.m4a")
    listing = client.get("/api/recordings").json()
    assert len(listing) == 1
    assert listing[0]["original_filename"] == "b.m4a"


def test_get_other_users_recording_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}").status_code == 404


def test_delete_recording(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    assert client.delete(f"/api/recordings/{rec_id}").status_code == 204
    assert client.get(f"/api/recordings/{rec_id}").status_code == 404


def test_upload_creates_pending_analysis_and_dispatches(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]

    assert fake_dispatcher.dispatched == [rec_id]
    analysis = client.get(f"/api/recordings/{rec_id}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["status"] == "pending"


def test_recording_payload_includes_analysis(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]

    body = client.get(f"/api/recordings/{rec_id}").json()
    assert body["analysis"]["status"] == "pending"


def test_recording_has_no_chart_until_analysis_writes_one(
    client, tmp_path, monkeypatch, fake_dispatcher
):
    """A song still being analysed has nothing but the engine to speak for it."""
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    _upload(client)

    assert client.get("/api/recordings").json()[0]["chart"] is None


def test_reanalyze_resets_status_and_dispatches(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client).json()["id"]
    fake_dispatcher.dispatched.clear()

    resp = client.post(f"/api/recordings/{rec_id}/analyze")
    assert resp.status_code == 202
    assert resp.json()["status"] == "pending"
    assert fake_dispatcher.dispatched == [rec_id]


def test_analysis_of_other_users_recording_is_404(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}/analysis").status_code == 404
    assert client.post(f"/api/recordings/{rec_id}/analyze").status_code == 404


def test_download_audio_returns_file(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client, "memo.m4a").json()["id"]

    resp = client.get(f"/api/recordings/{rec_id}/audio")
    assert resp.status_code == 200
    assert resp.content == b"fake-audio-bytes"
    assert resp.headers["content-type"] == "audio/mp4"


def test_download_audio_other_users_recording_is_404(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}/audio").status_code == 404
