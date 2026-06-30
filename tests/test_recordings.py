import io


def _register(client, username="alice"):
    client.post("/api/auth/register", json={"username": username, "password": "password123"})


def _upload(client, name="memo.m4a", duration=10.0):
    return client.post(
        "/api/recordings",
        files={"file": (name, io.BytesIO(b"fake-audio-bytes"), "audio/mp4")},
        data={"duration_seconds": str(duration)},
    )


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


def test_upload_requires_auth(client):
    resp = _upload(client)
    assert resp.status_code == 401


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
