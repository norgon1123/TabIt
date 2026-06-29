def test_register_then_me(client):
    resp = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 201
    assert resp.json()["username"] == "alice"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


def test_register_duplicate_username_rejected(client):
    client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    resp = client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
    assert resp.status_code == 409


def test_login_wrong_password_rejected(client):
    client.post("/api/auth/register", json={"username": "carol", "password": "password123"})
    client.post("/api/auth/logout")
    resp = client.post("/api/auth/login", json={"username": "carol", "password": "wrongpass1"})
    assert resp.status_code == 401


def test_login_sets_cookie_and_me_works(client):
    client.post("/api/auth/register", json={"username": "dave", "password": "password123"})
    client.post("/api/auth/logout")
    resp = client.post("/api/auth/login", json={"username": "dave", "password": "password123"})
    assert resp.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "dave"


def test_logout_revokes_session(client):
    client.post("/api/auth/register", json={"username": "erin", "password": "password123"})
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_logout_only_revokes_current_device(client):
    from fastapi.testclient import TestClient
    from app.main import app

    client.post("/api/auth/register", json={"username": "frank", "password": "password123"})
    device2 = TestClient(app)
    assert device2.post("/api/auth/login", json={"username": "frank", "password": "password123"}).status_code == 200
    assert device2.get("/api/auth/me").status_code == 200

    # Log out on device 1 only.
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    # Device 2 stays logged in.
    assert device2.get("/api/auth/me").status_code == 200
