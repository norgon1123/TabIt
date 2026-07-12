from app.models import (
    Analysis,
    ChordChart,
    ChordSegment,
    Recording,
    Session as SessionModel,
    User,
)


def test_user_recording_chart_segment_relationships(db_session):
    user = User(username="alice", password_hash="x")
    db_session.add(user)
    db_session.flush()

    rec = Recording(
        user_id=user.id,
        original_filename="memo.m4a",
        format="m4a",
        stored_path="/tmp/memo.m4a",
        duration_seconds=12.5,
    )
    db_session.add(rec)
    db_session.flush()

    chart = ChordChart(recording_id=rec.id, key_tonic="C", key_mode="major")
    db_session.add(chart)
    db_session.flush()

    seg = ChordSegment(
        chart_id=chart.id,
        start_beat=0.0,
        end_beat=2.0,
        chord_root="C",
        chord_quality="maj",
    )
    db_session.add(seg)
    db_session.commit()

    assert rec.user is user
    assert chart.recording is rec
    assert seg.chart is chart
    assert chart.segments == [seg]


def test_session_belongs_to_user(db_session):
    user = User(username="bob", password_hash="x")
    db_session.add(user)
    db_session.flush()
    s = SessionModel(user_id=user.id, token_hash="abc")
    db_session.add(s)
    db_session.commit()
    assert s.user is user


def test_chart_and_segment_have_beat_fields(db_session):
    from app.models import ChordChart, ChordSegment, Recording, User

    user = User(username="bob", password_hash="x")
    db_session.add(user)
    db_session.flush()
    rec = Recording(
        user_id=user.id, original_filename="m.m4a", format="m4a",
        stored_path="/tmp/m.m4a", duration_seconds=8.0,
    )
    db_session.add(rec)
    db_session.flush()
    chart = ChordChart(
        recording_id=rec.id, key_tonic="C", key_mode="major",
        beat_times=[0.0, 0.5, 1.0], beats_per_measure=4, measure_offset=0,
    )
    db_session.add(chart)
    db_session.flush()
    seg = ChordSegment(chart_id=chart.id, start_beat=0.0, end_beat=4.0,
                       chord_root="C", chord_quality="maj")
    db_session.add(seg)
    db_session.commit()

    assert chart.beats_per_measure == 4
    assert chart.beat_times == [0.0, 0.5, 1.0]
    assert chart.segments[0].end_beat == 4.0


def test_analysis_belongs_to_recording(db_session):
    user = User(username="carol", password_hash="x")
    db_session.add(user)
    db_session.flush()
    rec = Recording(
        user_id=user.id, original_filename="m.m4a", format="m4a",
        stored_path="/tmp/m.m4a", duration_seconds=5.0,
    )
    db_session.add(rec)
    db_session.flush()
    a = Analysis(recording_id=rec.id, status="done", bpm=120.0,
                 detected_key_tonic="C", detected_key_mode="major", engine_version="v1")
    db_session.add(a)
    db_session.commit()
    assert a.recording is rec
