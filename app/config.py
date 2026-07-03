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
    # Tier 1: Viterbi self-stay bias. Higher = steadier labels, absorbs more playing
    # mistakes; too high merges genuinely distinct chords.
    analysis_change_penalty: float = 1.0
    # Tier 1: run harmonic/percussive separation and analyse the harmonic part, so
    # percussion and pick/string noise stop polluting the chroma. Disable to A/B.
    analysis_use_hpss: bool = True
    # Chord engine: "chordino" (Tier 2; needs the vamp module + nnls-chroma Vamp plugin)
    # or "librosa" (built-in, no extra deps). Default is chordino because it is markedly
    # more accurate on real recordings; it falls back to librosa when the plugin is
    # missing. Set TABIT_ANALYSIS_ENGINE to force one.
    analysis_engine: str = "chordino"

    # --- Multi-instrument pipeline (Phase 0/1) ---
    # Compute backend for torch-based analysis (Demucs separation, deep chord model).
    # "auto" resolves cuda -> mps -> cpu; force with "cuda" | "mps" | "cpu".
    analysis_device: str = "auto"
    # Source separation. Off by default so the base app is byte-for-byte unchanged;
    # enabling it requires the ".[ml]" extra (Demucs) to be installed.
    enable_separation: bool = False
    # Demucs model. htdemucs_6s is the only 6-source model (adds guitar + piano stems).
    separation_model: str = "htdemucs_6s"
    # Stem persistence policy (Phase 1). "persist" keeps stems on disk (Option A, the
    # Phase 0/1 recommendation — never recompute the expensive separation step);
    # "ephemeral" would regenerate on demand. Swappable later without a schema change.
    stem_storage: str = "persist"
    # On-disk codec for persisted stems. FLAC (lossless) by default — lossy formats add
    # artifacts that degrade downstream chord/tab analysis.
    stem_format: str = "flac"


@lru_cache
def get_settings() -> Settings:
    return Settings()
