from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.audio.beatgrid import (
    ensure_grid,
    rescale_grid,
    rescale_windows,
    time_for_beat,
    total_beats,
)
from app.db import get_db
from app.deps import get_current_user, get_owned_recording
from app.models import ChordChart, ChordSegment, Recording, User
from app.music_theory import Quality, key_prefers_flats, roman_numeral, transpose_key, transpose_note
from app.schemas import (
    ChartCreate,
    ChartOut,
    ChartSettingsUpdate,
    SegmentBatchUpdate,
    SegmentCreate,
    SegmentOut,
    SegmentUpdate,
    TempoUpdate,
    TransposeRequest,
)

router = APIRouter(prefix="/api", tags=["charts"])


def _chart_bpm(chart: ChordChart) -> float | None:
    """The chart's working tempo: the user's if they set one, else what analysis detected."""
    if chart.bpm:
        return chart.bpm
    return chart.recording.analysis.bpm if chart.recording.analysis else None


def _chart_grid(chart: ChordChart) -> tuple[list[float], float]:
    duration = chart.recording.duration_seconds or 0.0
    grid = ensure_grid(list(chart.beat_times or []), _chart_bpm(chart), duration)
    return grid, duration


def _segment_out(seg: ChordSegment, chart: ChordChart, grid: list[float], duration: float) -> SegmentOut:
    return SegmentOut(
        id=seg.id,
        start_beat=seg.start_beat,
        end_beat=seg.end_beat,
        start_time=time_for_beat(seg.start_beat, grid, duration),
        end_time=time_for_beat(seg.end_beat, grid, duration),
        chord_root=seg.chord_root,
        chord_quality=seg.chord_quality,
        roman_numeral=roman_numeral(
            seg.chord_root, Quality(seg.chord_quality), chart.key_tonic, chart.key_mode
        ),
    )


def _chart_out(chart: ChordChart) -> ChartOut:
    grid, duration = _chart_grid(chart)
    return ChartOut(
        id=chart.id,
        recording_id=chart.recording_id,
        key_tonic=chart.key_tonic,
        key_mode=chart.key_mode,
        beats_per_measure=chart.beats_per_measure,
        measure_offset=chart.measure_offset,
        bpm=_chart_bpm(chart),
        beat_times=list(chart.beat_times or []),
        segments=[_segment_out(s, chart, grid, duration) for s in chart.segments],
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
    chart: ChordChart, start: float, end: float, exclude_id: str | None
) -> None:
    if start >= end:
        raise HTTPException(status_code=422, detail="start_beat must be before end_beat")
    grid, duration = _chart_grid(chart)
    if duration and end > total_beats(grid, duration) + 1e-6:
        raise HTTPException(status_code=422, detail="end_beat exceeds the chart's beat grid")
    for other in chart.segments:
        if other.id == exclude_id:
            continue
        if start < other.end_beat and end > other.start_beat:
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
    _validate_segment_window(chart, payload.start_beat, payload.end_beat, None)
    seg = ChordSegment(
        chart_id=chart.id,
        start_beat=payload.start_beat,
        end_beat=payload.end_beat,
        chord_root=payload.chord_root,
        chord_quality=payload.chord_quality,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)


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
    new_start = payload.start_beat if payload.start_beat is not None else seg.start_beat
    new_end = payload.end_beat if payload.end_beat is not None else seg.end_beat
    _validate_segment_window(chart, new_start, new_end, exclude_id=seg.id)
    seg.start_beat = new_start
    seg.end_beat = new_end
    if payload.chord_root is not None:
        seg.chord_root = payload.chord_root
    if payload.chord_quality is not None:
        seg.chord_quality = payload.chord_quality
    db.commit()
    db.refresh(seg)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)


@router.patch("/charts/{chart_id}/segments", response_model=ChartOut)
def resize_segments(
    chart_id: str,
    payload: SegmentBatchUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    by_id = {s.id: s for s in chart.segments}
    for w in payload.segments:
        if w.id not in by_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
        if w.start_beat >= w.end_beat:
            raise HTTPException(status_code=422, detail="start_beat must be before end_beat")

    # Validate the resulting FULL set (requested windows layered over current ones).
    windows = {s.id: (s.start_beat, s.end_beat) for s in chart.segments}
    for w in payload.segments:
        windows[w.id] = (w.start_beat, w.end_beat)
    ordered = sorted(windows.values())
    for (s1, e1), (s2, e2) in zip(ordered, ordered[1:]):
        if s1 < e2 and e1 > s2:
            raise HTTPException(status_code=422, detail="segment overlaps an existing segment")
    grid, duration = _chart_grid(chart)
    # ordered[-1][1] is the global max end_beat only because the overlap check above
    # already guaranteed the set is non-overlapping (sorted-by-start == sorted-by-end).
    if duration and ordered and ordered[-1][1] > total_beats(grid, duration) + 1e-6:
        raise HTTPException(status_code=422, detail="end_beat exceeds the chart's beat grid")

    for w in payload.segments:
        seg = by_id[w.id]
        seg.start_beat = w.start_beat
        seg.end_beat = w.end_beat
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)


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


@router.patch("/charts/{chart_id}/settings", response_model=ChartOut)
def update_chart_settings(
    chart_id: str,
    payload: ChartSettingsUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    chart = _owned_chart(db, user, chart_id)
    if payload.beats_per_measure is not None:
        chart.beats_per_measure = payload.beats_per_measure
    if payload.measure_offset is not None:
        chart.measure_offset = payload.measure_offset
    if payload.key_tonic is not None:
        chart.key_tonic = payload.key_tonic
    if payload.key_mode is not None:
        chart.key_mode = payload.key_mode
    db.commit()
    db.refresh(chart)
    return _chart_out(chart)


@router.patch("/charts/{chart_id}/tempo", response_model=ChartOut)
def update_chart_tempo(
    chart_id: str,
    payload: TempoUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChartOut:
    """Set the chart's tempo, re-indexing the beat grid and rescaling every segment.

    Beat trackers land an octave out often enough (this chart's engine heard 143.6 BPM in a
    73.8 BPM song) that the metrical level has to be the player's call. Setting the BPM does
    not move any chord in *time* — it changes how many beats that chord is counted as, so
    halving the tempo turns eight-beat chords into four-beat chords over the same audio.
    """
    chart = _owned_chart(db, user, chart_id)
    current = _chart_bpm(chart)
    if not current or current <= 0:
        raise HTTPException(status_code=422, detail="chart has no tempo to rescale from")

    grid, duration = _chart_grid(chart)
    factor = payload.bpm / current
    new_grid = rescale_grid(grid, factor, duration)
    max_beat = total_beats(new_grid, duration) if duration else 0.0

    ordered = sorted(chart.segments, key=lambda s: s.start_beat)
    windows = rescale_windows([(s.start_beat, s.end_beat) for s in ordered], factor, max_beat)
    for seg, window in zip(ordered, windows):
        if window is None:  # squeezed past the end of the grid; nothing left to show
            db.delete(seg)
            continue
        seg.start_beat, seg.end_beat = window

    chart.beat_times = new_grid
    chart.bpm = payload.bpm
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
