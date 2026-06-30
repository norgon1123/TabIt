from app.audio.analyzer import AnalysisResult
from app.audio.segments import DetectedSegment
from app.jobs import analyze_recording
from app.models import Analysis, ChordChart, Recording, User
from app.music_theory import Quality
from app.security import hash_password


class StubAnalyzer:
    def __init__(self, result=None, exc=None):
        self._result = result
        self._exc = exc

    def analyze(self, audio_path):
        if self._exc is not None:
            raise self._exc
        return self._result


def _seed_pending_recording(db):
    user = User(username="u", password_hash=hash_password("password123"))
    db.add(user)
    db.flush()
    rec = Recording(
        user_id=user.id, original_filename="a.wav", format="wav",
        stored_path="/x/a.wav", duration_seconds=4.0,
    )
    db.add(rec)
    db.flush()
    db.add(Analysis(recording_id=rec.id, status="pending"))
    db.commit()
    return rec


def test_successful_analysis_seeds_chart(db_session):
    rec = _seed_pending_recording(db_session)
    result = AnalysisResult(
        bpm=120.0, key_tonic_pc=0, key_mode="major", duration=4.0,
        segments=[
            DetectedSegment(0.0, 2.0, 0, Quality.MAJ),
            DetectedSegment(2.0, 4.0, 7, Quality.MAJ),
        ],
        engine_version="template-v1",
    )

    analyze_recording(db_session, rec.id, StubAnalyzer(result=result))

    analysis = db_session.query(Analysis).filter_by(recording_id=rec.id).one()
    assert analysis.status == "done"
    assert analysis.bpm == 120.0
    assert analysis.detected_key_tonic == "C"
    assert analysis.detected_key_mode == "major"
    assert analysis.engine_version == "template-v1"
    chart = db_session.query(ChordChart).filter_by(recording_id=rec.id).one()
    assert chart.key_tonic == "C"
    assert [(s.chord_root, s.chord_quality) for s in chart.segments] == [
        ("C", "maj"), ("G", "maj"),
    ]


def test_failed_analysis_records_error_and_no_chart(db_session):
    rec = _seed_pending_recording(db_session)

    analyze_recording(db_session, rec.id, StubAnalyzer(exc=RuntimeError("bad audio")))

    analysis = db_session.query(Analysis).filter_by(recording_id=rec.id).one()
    assert analysis.status == "failed"
    assert "bad audio" in analysis.error
    assert db_session.query(ChordChart).filter_by(recording_id=rec.id).count() == 0


def test_seeding_failure_marks_failed_not_running(db_session, monkeypatch):
    import app.jobs as jobs

    rec = _seed_pending_recording(db_session)
    result = AnalysisResult(120.0, 0, "major", 4.0, [DetectedSegment(0.0, 4.0, 0, Quality.MAJ)])

    def boom(*args, **kwargs):
        raise RuntimeError("seed failed")

    monkeypatch.setattr(jobs, "_seed_chart", boom)

    analyze_recording(db_session, rec.id, StubAnalyzer(result=result))

    analysis = db_session.query(Analysis).filter_by(recording_id=rec.id).one()
    assert analysis.status == "failed"
    assert "seed failed" in analysis.error
    assert db_session.query(ChordChart).filter_by(recording_id=rec.id).count() == 0


def test_reanalysis_replaces_existing_chart(db_session):
    rec = _seed_pending_recording(db_session)
    first = AnalysisResult(120.0, 0, "major", 4.0, [DetectedSegment(0.0, 4.0, 0, Quality.MAJ)])
    analyze_recording(db_session, rec.id, StubAnalyzer(result=first))

    second = AnalysisResult(90.0, 7, "major", 4.0, [DetectedSegment(0.0, 4.0, 7, Quality.MAJ)])
    analyze_recording(db_session, rec.id, StubAnalyzer(result=second))

    chart = db_session.query(ChordChart).filter_by(recording_id=rec.id).one()
    assert chart.key_tonic == "G"
    assert [(s.chord_root, s.chord_quality) for s in chart.segments] == [("G", "maj")]


def test_seeding_overwrites_browser_duration_and_clamps_segments(db_session):
    rec = _seed_pending_recording(db_session)  # browser-reported duration_seconds = 4.0
    # Server decoded a longer file; a stray segment runs past the true end and must be clamped.
    result = AnalysisResult(
        120.0, 0, "major", 7.5,
        [DetectedSegment(0.0, 4.0, 0, Quality.MAJ), DetectedSegment(4.0, 9.0, 7, Quality.MAJ)],
    )

    analyze_recording(db_session, rec.id, StubAnalyzer(result=result))

    db_session.refresh(rec)
    assert rec.duration_seconds == 7.5  # authoritative server duration wins
    chart = db_session.query(ChordChart).filter_by(recording_id=rec.id).one()
    ends = sorted(s.end_time for s in chart.segments)
    assert max(ends) <= 7.5  # never exceeds the audio length


def test_dispatcher_uses_configured_min_segment_seconds(monkeypatch):
    # Round 2 #1: the min-segment threshold is an easily-adjustable setting (default 0.75).
    from app.config import get_settings
    from app.jobs import get_job_dispatcher

    assert get_settings().analysis_min_segment_seconds == 0.75

    monkeypatch.setenv("TABIT_ANALYSIS_MIN_SEGMENT_SECONDS", "1.5")
    get_settings.cache_clear()
    get_job_dispatcher.cache_clear()
    dispatcher = get_job_dispatcher()
    try:
        assert dispatcher._analyzer._min_segment_seconds == 1.5
    finally:
        dispatcher.shutdown()
        get_job_dispatcher.cache_clear()
