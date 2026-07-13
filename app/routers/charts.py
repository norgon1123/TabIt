from fastapi import APIRouter, Depends, HTTPException, status

from app.audio.beatgrid import (
    ensure_grid,
    rescale_grid,
    rescale_windows,
    time_for_beat,
    total_beats,
)
from app.chart_store import ChartLike, ChartStore, SegmentLike
from app.deps import get_chart_store, get_recording_for_principal
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

# Every handler here goes through a ChartStore (app/chart_store.py), so a guest's in-memory
# chart and a signed-in user's rows follow the same editing rules — the same validation, the
# same beat grid, the same chord sheet.


def _chart_bpm(chart: ChartLike) -> float | None:
    """The chart's working tempo: the user's if they set one, else what analysis detected."""
    if chart.bpm:
        return chart.bpm
    return chart.recording.analysis.bpm if chart.recording.analysis else None


def _chart_grid(chart: ChartLike) -> tuple[list[float], float]:
    duration = chart.recording.duration_seconds or 0.0
    grid = ensure_grid(list(chart.beat_times or []), _chart_bpm(chart), duration)
    return grid, duration


def _segment_out(seg: SegmentLike, chart: ChartLike, grid: list[float], duration: float) -> SegmentOut:
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


def _chart_out(chart: ChartLike) -> ChartOut:
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


def _validate_segment_window(
    chart: ChartLike, start: float, end: float, exclude_id: str | None
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
    payload: ChartCreate,
    rec=Depends(get_recording_for_principal),
    store: ChartStore = Depends(get_chart_store),
) -> ChartOut:
    if rec.chart is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chart already exists")
    chart = store.create(rec, payload.key_tonic, payload.key_mode)
    store.commit(chart)
    return _chart_out(chart)


@router.get("/recordings/{recording_id}/chart", response_model=ChartOut)
def get_chart(rec=Depends(get_recording_for_principal)) -> ChartOut:
    if rec.chart is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart not found")
    return _chart_out(rec.chart)


@router.post(
    "/charts/{chart_id}/segments", response_model=SegmentOut, status_code=status.HTTP_201_CREATED
)
def add_segment(
    chart_id: str,
    payload: SegmentCreate,
    store: ChartStore = Depends(get_chart_store),
) -> SegmentOut:
    chart = store.get(chart_id)
    _validate_segment_window(chart, payload.start_beat, payload.end_beat, None)
    seg = store.new_segment(
        payload.start_beat, payload.end_beat, payload.chord_root, payload.chord_quality
    )
    chart.segments.append(seg)
    store.commit(chart)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)


@router.patch("/charts/{chart_id}/segments/{segment_id}", response_model=SegmentOut)
def update_segment(
    chart_id: str,
    segment_id: str,
    payload: SegmentUpdate,
    store: ChartStore = Depends(get_chart_store),
) -> SegmentOut:
    chart = store.get(chart_id)
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
    store.commit(chart)
    grid, duration = _chart_grid(chart)
    return _segment_out(seg, chart, grid, duration)


@router.patch("/charts/{chart_id}/segments", response_model=ChartOut)
def resize_segments(
    chart_id: str,
    payload: SegmentBatchUpdate,
    store: ChartStore = Depends(get_chart_store),
) -> ChartOut:
    chart = store.get(chart_id)
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
    store.commit(chart)
    return _chart_out(chart)


@router.delete(
    "/charts/{chart_id}/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_segment(
    chart_id: str,
    segment_id: str,
    store: ChartStore = Depends(get_chart_store),
) -> None:
    chart = store.get(chart_id)
    seg = next((s for s in chart.segments if s.id == segment_id), None)
    if seg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment not found")
    chart.segments.remove(seg)  # delete-orphan on the DB side; a list removal for a guest
    store.commit(chart)


@router.patch("/charts/{chart_id}/settings", response_model=ChartOut)
def update_chart_settings(
    chart_id: str,
    payload: ChartSettingsUpdate,
    store: ChartStore = Depends(get_chart_store),
) -> ChartOut:
    chart = store.get(chart_id)
    if payload.beats_per_measure is not None:
        chart.beats_per_measure = payload.beats_per_measure
    if payload.measure_offset is not None:
        chart.measure_offset = payload.measure_offset
    if payload.key_tonic is not None:
        chart.key_tonic = payload.key_tonic
    if payload.key_mode is not None:
        chart.key_mode = payload.key_mode
    store.commit(chart)
    return _chart_out(chart)


@router.patch("/charts/{chart_id}/tempo", response_model=ChartOut)
def update_chart_tempo(
    chart_id: str,
    payload: TempoUpdate,
    store: ChartStore = Depends(get_chart_store),
) -> ChartOut:
    """Set the chart's tempo, re-indexing the beat grid and rescaling every segment.

    Beat trackers land an octave out often enough (this chart's engine heard 143.6 BPM in a
    73.8 BPM song) that the metrical level has to be the player's call. Setting the BPM does
    not move any chord in *time* — it changes how many beats that chord is counted as, so
    halving the tempo turns eight-beat chords into four-beat chords over the same audio.
    """
    chart = store.get(chart_id)
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
            chart.segments.remove(seg)
            continue
        seg.start_beat, seg.end_beat = window

    chart.beat_times = new_grid
    chart.bpm = payload.bpm
    store.commit(chart)
    return _chart_out(chart)


@router.post("/charts/{chart_id}/transpose", response_model=ChartOut)
def transpose_chart(
    chart_id: str,
    payload: TransposeRequest,
    store: ChartStore = Depends(get_chart_store),
) -> ChartOut:
    chart = store.get(chart_id)
    new_tonic = transpose_key(chart.key_tonic, chart.key_mode, payload.semitones)
    prefer_flats = key_prefers_flats(new_tonic, chart.key_mode)
    chart.key_tonic = new_tonic
    for seg in chart.segments:
        seg.chord_root = transpose_note(seg.chord_root, payload.semitones, prefer_flats=prefer_flats)
    store.commit(chart)
    return _chart_out(chart)
