import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.audio.decode import ffmpeg_available
from app.db import Base, engine
from app.jobs import get_job_dispatcher
from app.migrations import run_additive_migrations
from app.routers import auth, charts, recordings
from app.storage import purge_guest_audio

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # create_all builds missing tables but never adds columns to existing ones,
    # so a pre-existing database keeps its stale schema. Bridge that gap (e.g.
    # the beat-native columns) so queries and deletes don't fail on old DBs.
    added = run_additive_migrations(engine)
    if added:
        logger.info("applied additive migrations: %s", ", ".join(added))
    if not ffmpeg_available():
        logger.error(
            "ffmpeg not found on PATH — audio analysis will fail until ffmpeg is installed"
        )
    # Guest recordings live in memory and did not survive the restart; any guest audio still
    # on disk is a leftover from a process that died mid-analysis, and must not outlive the
    # processing it was uploaded for.
    purge_guest_audio()
    try:
        yield
    finally:
        get_job_dispatcher().shutdown()


app = FastAPI(title="Tabit", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(charts.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
