import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.audio.decode import ffmpeg_available
from app.db import Base, engine
from app.jobs import get_job_dispatcher
from app.routers import auth, charts, recordings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if not ffmpeg_available():
        logger.error(
            "ffmpeg not found on PATH — audio analysis will fail until ffmpeg is installed"
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
