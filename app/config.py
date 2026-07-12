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
    # Chord engine, set with TABIT_ANALYSIS_ENGINE:
    #   "chordino" - Tier 2; needs the vamp module + the nnls-chroma Vamp plugin. Default:
    #                markedly more accurate than librosa on real recordings, and it falls
    #                back to librosa when the plugin is missing.
    #   "librosa"  - the built-in HPSS-chroma + Viterbi engine (no extra deps).
    #   "btc"      - Tier 3; the pretrained BTC transformer, optionally fed a Demucs stem
    #                (see enable_separation). Needs the ".[ml]" extra and staged weights
    #                under vendor/btc/weights/; it does NOT fall back — a missing dep fails
    #                the recording with a message rather than quietly using a weaker engine.
    analysis_engine: str = "chordino"

    # --- Multi-instrument pipeline (Phase 0/1) ---
    # Compute backend for torch-based analysis (Demucs separation, deep chord model).
    # "auto" resolves cuda -> mps -> cpu; force with "cuda" | "mps" | "cpu".
    analysis_device: str = "auto"
    # Source separation. Off by default so the base app is byte-for-byte unchanged;
    # enabling it requires the ".[ml]" extra (Demucs) to be installed. Only the "btc"
    # engine consumes stems today: engine=btc + enable_separation=true is the full
    # demucs -> btc pipeline; engine=btc alone runs the model on the raw mix (the control).
    enable_separation: bool = False
    # Demucs model. htdemucs_6s is the only 6-source model (adds guitar + piano stems).
    separation_model: str = "htdemucs_6s"
    # Which stems feed the chord model: a preset from separation.STEM_PRESETS
    # ("harmonic" = guitar+piano+other, "accomp" = + bass, "full" = the whole mix) or an
    # explicit comma-separated source list, e.g. "guitar,piano".
    separation_stems: str = "harmonic"
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
