from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import get_current_user, get_owned_recording
from app.models import ChordChart, ChordSegment, Recording, User
from app.music_theory import Quality, key_prefers_flats, roman_numeral, transpose_key, transpose_note
from app.schemas import (
    ChartCreate,
    ChartOut,
    SegmentCreate,
    SegmentOut,
    SegmentReorder,
    SegmentUpdate,
    TransposeRequest,
)

router = APIRouter(prefix="/api", tags=["charts"])


def _segment_out(seg: ChordSegment, chart: ChordChart) -> SegmentOut:
    return SegmentOut(
        id=seg.id,
        start_time=seg.start_time,
        end_time=seg.end_time,
        chord_root=seg.chord_root,
        chord_quality=seg.chord_quality,
        roman_numeral=roman_numeral(
            seg.chord_root, Quality(seg.chord_quality), chart.key_tonic, chart.key_mode
        ),
    )


def _chart_out(chart: ChordChart) -> ChartOut:
    return ChartOut(
        id=chart.id,
        recording_id=chart.recording_id,
        key_tonic=chart.key_tonic,
        key_mode=chart.key_mode,
        segments=[_segment_out(s, chart) for s in chart.segments],
    )


def _owned_chart(db: DbSession, user: User, chart_id: str) -> ChordChart:
    chart = db.execute(
        select(ChordChart)
        .join(Recording, ChordChart.recording_id == Recording.id)
        .where(ChordChart.id == chart_id, Recording.user_id == user.id)
    ).scalar_one_or_none()
    if chart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")
    return chart


def _validate_segment_window(
    chart: ChordChart, start: float, end: float, duration: float | None, exclude_id: str | None
) -> None:
    if start >= end:
        raise HTTPException(status_code=422, detail="start_time must be before end_time")
    if duration is not None and end > duration:
        raise HTTPException(status_code=422, detail="end_time exceeds recording duration")
    for other in chart.segments:
        if other.id == exclude_id:
            continue
        if start < other.end_time and end > other.start_time:
            raise HTTPException(status_code=422, detail="segment overlaps an existing segment")


@router.post(
    "/recordings/{recording_id}/chart",
    response_model=ChartOut,
    status_code=status.HTTP_201_CREATED,
)
def create_chart(
    recording_id: str,
    payload: ChartCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    rec = get_owned_recording(db, user, recording_id)
    if rec.chart is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chart already exists")
    chart = ChordChart(recording_id=rec.id, key_tonic=payload.key_tonic, key_mode=payload.key_mode)
    db.add(chart)
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)


@router.get("/recordings/{recording_id}/chart", response_model=ChartOut)
def get_chart(
    recording_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    rec = get_owned_recording(db, user, recording_id)
    if rec.chart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")
    return _chart_out(rec.chart)


@router.post(
    "/charts/{chart_id}/segments", response_model=SegmentOut, status_code=status.HTTP_201_CREATED
)
def add_segment(
    chart_id: str,
    payload: SegmentCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SegmentOut:
    chart = _owned_chart(db, user, chart_id)
    _validate_segment_window(
        chart, payload.start_time, payload.end_time, chart.recording.duration_seconds, None
    )
    seg = ChordSegment(
        chart_id=chart.id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        chord_root=payload.chord_root,
        chord_quality=payload.chord_quality,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return _segment_out(seg, chart)


@router.patch("/charts/{chart_id}/segments/{segment_id}", response_model=SegmentOut)
def update_segment(
    chart_id: str,
    segment_id: str,
    payload: SegmentUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SegmentOut:
    chart = _owned_chart(db, user, chart_id)
    seg = next((s for s in chart.segments if s.id == segment_id), None)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    new_start = payload.start_time if payload.start_time is not None else seg.start_time
    new_end = payload.end_time if payload.end_time is not None else seg.end_time
    _validate_segment_window(
        chart, new_start, new_end, chart.recording.duration_seconds, exclude_id=seg.id
    )
    seg.start_time = new_start
    seg.end_time = new_end
    if payload.chord_root is not None:
        seg.chord_root = payload.chord_root
    if payload.chord_quality is not None:
        seg.chord_quality = payload.chord_quality
    db.commit()
    db.refresh(seg)
    return _segment_out(seg, chart)


@router.delete(
    "/charts/{chart_id}/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_segment(
    chart_id: str,
    segment_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    chart = _owned_chart(db, user, chart_id)
    seg = next((s for s in chart.segments if s.id == segment_id), None)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    db.delete(seg)
    db.commit()


@router.post("/charts/{chart_id}/reorder", response_model=ChartOut)
def reorder_segments(
    chart_id: str,
    payload: SegmentReorder,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    by_id = {s.id: s for s in chart.segments}
    if set(payload.segment_ids) != set(by_id) or len(payload.segment_ids) != len(by_id):
        raise HTTPException(
            status_code=422, detail="segment_ids must be a permutation of the chart's segments"
        )
    # Lay the chords back-to-back in the requested order, each keeping its own duration,
    # anchored at the earliest existing start so the chart never grows past the audio.
    cursor = min((s.start_time for s in chart.segments), default=0.0)
    duration = chart.recording.duration_seconds
    for seg_id in payload.segment_ids:
        seg = by_id[seg_id]
        length = seg.end_time - seg.start_time
        seg.start_time = cursor
        seg.end_time = cursor + length
        cursor = seg.end_time
    if duration is not None and cursor > duration:
        raise HTTPException(status_code=422, detail="reordered segments exceed recording duration")
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)


@router.post("/charts/{chart_id}/transpose", response_model=ChartOut)
def transpose_chart(
    chart_id: str,
    payload: TransposeRequest,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    new_tonic = transpose_key(chart.key_tonic, chart.key_mode, payload.semitones)
    prefer_flats = key_prefers_flats(new_tonic, chart.key_mode)
    chart.key_tonic = new_tonic
    for seg in chart.segments:
        seg.chord_root = transpose_note(seg.chord_root, payload.semitones, prefer_flats=prefer_flats)
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)
