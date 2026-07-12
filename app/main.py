import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.audio.decode import ffmpeg_available
from app.config import get_settings
from app.db import Base, engine
from app.jobs import get_job_dispatcher
from app.migrations import run_additive_migrations
from app.routers import auth, charts, recordings

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
    # Settings are read once, at import. `uvicorn --reload` only watches *.py, so editing
    # .env does not restart the worker and the engine you picked there silently does not
    # take effect until the process is restarted. Log what this process actually resolved.
    settings = get_settings()
    logger.info(
        "analysis engine=%s, separation=%s (model=%s, stems=%s), device=%s",
        settings.analysis_engine,
        settings.enable_separation,
        settings.separation_model,
        settings.separation_stems,
        settings.analysis_device,
    )
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
