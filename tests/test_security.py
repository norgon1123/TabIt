from app.security import (
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_generate_session_token_is_random_and_long():
    a = generate_session_token()
    b = generate_session_token()
    assert a != b
    assert len(a) >= 32


def test_hash_token_is_deterministic():
    token = "abc123"
    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != hash_token("different")
