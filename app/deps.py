from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.models import Recording, Session as SessionModel, User
from app.security import hash_token

_settings = get_settings()


def get_current_user(
    db: DbSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias=_settings.session_cookie_name),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    row = db.execute(
        select(SessionModel).where(SessionModel.token_hash == hash_token(session_token))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return row.user


def get_owned_recording(db: DbSession, user: User, recording_id: str) -> Recording:
    rec = db.execute(
        select(Recording).where(Recording.id == recording_id, Recording.user_id == user.id)
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return rec
