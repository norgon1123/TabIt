"""One seam, two backings.

A chart is either ORM rows belonging to a signed-in user or the in-memory object a guest's
analysis produced (app/guest.py). The chart router talks to a `ChartStore` and never learns
which — that's what lets a logged-out visitor get exactly the chord-sheet experience an
account holder gets, without a second copy of the editing rules.

The two implementations differ in only three ways: how a chart is found, how a new segment
is minted, and what "commit" means (a DB transaction, or re-sorting a list in memory).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.guest import GuestChart, GuestRecording, GuestSegment
from app.models import ChordChart, ChordSegment, Recording, User


class SegmentLike(Protocol):
    id: str
    start_beat: float
    end_beat: float
    chord_root: str
    chord_quality: str


class ChartLike(Protocol):
    id: str
    recording_id: str
    key_tonic: str
    key_mode: str
    beats_per_measure: int
    measure_offset: int
    beat_times: list[float]
    bpm: float | None  # the working tempo; None falls back to the detected Analysis.bpm
    segments: list[SegmentLike]
    recording: Any  # carries duration_seconds and the analysis the beat grid is derived from


class ChartStore(Protocol):
    def get(self, chart_id: str) -> ChartLike:
        """The requester's chart with this id, or 404 — ownership is the store's business."""

    def create(self, recording, key_tonic: str, key_mode: str) -> ChartLike: ...

    def new_segment(
        self, start_beat: float, end_beat: float, chord_root: str, chord_quality: str
    ) -> SegmentLike:
        """A segment to append to `chart.segments`; not yet committed."""

    def commit(self, chart: ChartLike) -> None: ...


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")


@dataclass
class DbChartStore:
    db: DbSession
    user: User

    def get(self, chart_id: str) -> ChordChart:
        chart = self.db.execute(
            select(ChordChart)
            .join(Recording, ChordChart.recording_id == Recording.id)
            .where(ChordChart.id == chart_id, Recording.user_id == self.user.id)
        ).scalar_one_or_none()
        if chart is None:
            raise _not_found()
        return chart

    def create(self, recording: Recording, key_tonic: str, key_mode: str) -> ChordChart:
        chart = ChordChart(recording_id=recording.id, key_tonic=key_tonic, key_mode=key_mode)
        self.db.add(chart)
        return chart

    def new_segment(
        self, start_beat: float, end_beat: float, chord_root: str, chord_quality: str
    ) -> ChordSegment:
        # Appending this to chart.segments sets chart_id through the relationship, and the
        # cascade writes it on commit.
        return ChordSegment(
            id=uuid.uuid4().hex,
            start_beat=start_beat,
            end_beat=end_beat,
            chord_root=chord_root,
            chord_quality=chord_quality,
        )

    def commit(self, chart: ChordChart) -> None:
        self.db.commit()  # segments come back ordered by start_beat on the next load


@dataclass
class GuestChartStore:
    """The guest's one chart, held in memory. Nothing here touches the database."""

    recording: GuestRecording | None

    def get(self, chart_id: str) -> GuestChart:
        chart = self.recording.chart if self.recording else None
        if chart is None or chart.id != chart_id:
            raise _not_found()
        return chart

    def create(self, recording: GuestRecording, key_tonic: str, key_mode: str) -> GuestChart:
        recording.chart = GuestChart(
            recording=recording, key_tonic=key_tonic, key_mode=key_mode
        )
        return recording.chart

    def new_segment(
        self, start_beat: float, end_beat: float, chord_root: str, chord_quality: str
    ) -> GuestSegment:
        return GuestSegment(
            start_beat=start_beat,
            end_beat=end_beat,
            chord_root=chord_root,
            chord_quality=chord_quality,
        )

    def commit(self, chart: GuestChart) -> None:
        # The ORM relationship keeps segments ordered by start_beat; a plain list needs saying.
        chart.segments.sort(key=lambda s: s.start_beat)
