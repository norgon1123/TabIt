from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TABIT_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./tabit.db"
    storage_dir: str = "./storage"
    session_cookie_name: str = "tabit_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 365  # 1 year ("stay logged in")
    cookie_secure: bool = False  # set True behind HTTPS in production
    analysis_sample_rate: int = 22050  # Hz; resample target for analysis
    analysis_max_workers: int = 1  # background analysis threads
    # Round 2 #1: chord segments shorter than this are treated as false positives and
    # absorbed into a neighbour. Easily tuned via TABIT_ANALYSIS_MIN_SEGMENT_SECONDS.
    analysis_min_segment_seconds: float = 0.75


@lru_cache
def get_settings() -> Settings:
    return Settings()
