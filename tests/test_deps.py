def test_protected_route_requires_session(client):
    # /api/auth/me is the canonical protected route; without a cookie -> 401
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
