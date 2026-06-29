import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    recordings: Mapped[list["Recording"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="sessions")


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    format: Mapped[str] = mapped_column(String, nullable=False)
    stored_path: Mapped[str] = mapped_column(String, nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="uploaded", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="recordings")
    analysis: Mapped["Analysis | None"] = relationship(
        back_populates="recording", cascade="all, delete-orphan", uselist=False
    )
    chart: Mapped["ChordChart | None"] = relationship(
        back_populates="recording", cascade="all, delete-orphan", uselist=False
    )


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    recording_id: Mapped[str] = mapped_column(
        ForeignKey("recordings.id"), unique=True, index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    detected_key_tonic: Mapped[str | None] = mapped_column(String, nullable=True)
    detected_key_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    engine_version: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    recording: Mapped[Recording] = relationship(back_populates="analysis")


class ChordChart(Base):
    __tablename__ = "chord_charts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    recording_id: Mapped[str] = mapped_column(
        ForeignKey("recordings.id"), unique=True, index=True, nullable=False
    )
    key_tonic: Mapped[str] = mapped_column(String, nullable=False)
    key_mode: Mapped[str] = mapped_column(String, nullable=False)

    recording: Mapped[Recording] = relationship(back_populates="chart")
    segments: Mapped[list["ChordSegment"]] = relationship(
        back_populates="chart",
        cascade="all, delete-orphan",
        order_by="ChordSegment.start_time",
    )


class ChordSegment(Base):
    __tablename__ = "chord_segments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    chart_id: Mapped[str] = mapped_column(ForeignKey("chord_charts.id"), index=True, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    chord_root: Mapped[str] = mapped_column(String, nullable=False)
    chord_quality: Mapped[str] = mapped_column(String, nullable=False)

    chart: Mapped[ChordChart] = relationship(back_populates="segments")
