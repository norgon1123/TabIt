import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import get_current_user, get_owned_recording
from app.jobs import JobDispatcher, get_job_dispatcher
from app.models import Analysis, Recording, User
from app.schemas import AnalysisOut, RecordingOut
from app.storage import delete_audio, save_audio

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

_AUDIO_MEDIA_TYPES = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
}


@router.get("", response_model=list[RecordingOut])
def list_recordings(
    db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Recording]:
    return list(
        db.execute(
            select(Recording).where(Recording.user_id == user.id).order_by(Recording.created_at.desc())
        ).scalars()
    )


@router.post("", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
def upload_recording(
    file: UploadFile = File(...),
    duration_seconds: float | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    dispatcher: JobDispatcher = Depends(get_job_dispatcher),
) -> Recording:
    filename = file.filename or "recording"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    rec = Recording(
        user_id=user.id,
        original_filename=filename,
        format=ext,
        stored_path="",
        duration_seconds=duration_seconds,
    )
    db.add(rec)
    db.flush()  # assign rec.id
    rec.stored_path = save_audio(user.id, rec.id, ext, file.file.read())
    db.add(Analysis(recording_id=rec.id, status="pending"))
    try:
        db.commit()
    except Exception:
        # Roll back the row and remove the just-written file so neither is orphaned.
        db.rollback()
        delete_audio(rec.stored_path)
        raise
    db.refresh(rec)
    dispatcher.dispatch(rec.id)
    return rec


@router.get("/{recording_id}", response_model=RecordingOut)
def get_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Recording:
    return get_owned_recording(db, user, recording_id)


@router.get("/{recording_id}/analysis", response_model=AnalysisOut)
def get_analysis(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Analysis:
    rec = get_owned_recording(db, user, recording_id)
    if rec.analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    return rec.analysis


@router.post(
    "/{recording_id}/analyze",
    response_model=AnalysisOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def reanalyze_recording(
    recording_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    dispatcher: JobDispatcher = Depends(get_job_dispatcher),
) -> Analysis:
    rec = get_owned_recording(db, user, recording_id)
    if rec.analysis is not None:
        db.delete(rec.analysis)  # immutable Analysis: re-run creates a fresh one
        db.flush()
    analysis = Analysis(recording_id=rec.id, status="pending")
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    dispatcher.dispatch(rec.id)
    return analysis


@router.get("/{recording_id}/audio")
def get_recording_audio(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> FileResponse:
    rec = get_owned_recording(db, user, recording_id)
    if not rec.stored_path or not os.path.exists(rec.stored_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found")
    media_type = _AUDIO_MEDIA_TYPES.get(rec.format, "application/octet-stream")
    return FileResponse(rec.stored_path, media_type=media_type, filename=rec.original_filename)


@router.delete("/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    rec = get_owned_recording(db, user, recording_id)
    delete_audio(rec.stored_path)
    db.delete(rec)
    db.commit()
