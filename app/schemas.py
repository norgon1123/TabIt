from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    bpm: float | None
    detected_key_tonic: str | None
    detected_key_mode: str | None
    engine_version: str | None
    error: str | None
    beat_times: list[float] = Field(default_factory=list)


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    original_filename: str
    format: str
    duration_seconds: float | None
    status: str
    created_at: datetime
    analysis: AnalysisOut | None = None


class RecordingUpdate(BaseModel):
    # Round 2 #6: names are user-editable and need not be unique.
    original_filename: str = Field(min_length=1, max_length=255)


class ChartCreate(BaseModel):
    key_tonic: str = Field(pattern="^[A-G][b#]?$")
    key_mode: str = Field(pattern="^(major|minor)$")


class SegmentCreate(BaseModel):
    start_beat: float = Field(ge=0)
    end_beat: float = Field(gt=0)
    chord_root: str = Field(pattern="^[A-G][b#]?$")
    chord_quality: str = Field(pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentUpdate(BaseModel):
    start_beat: float | None = Field(default=None, ge=0)
    end_beat: float | None = Field(default=None, gt=0)
    chord_root: str | None = Field(default=None, pattern="^[A-G][b#]?$")
    chord_quality: str | None = Field(default=None, pattern="^(maj|min|dom7|maj7|min7)$")


class SegmentOut(BaseModel):
    id: str
    start_beat: float
    end_beat: float
    start_time: float
    end_time: float
    chord_root: str
    chord_quality: str
    roman_numeral: str


class ChartOut(BaseModel):
    id: str
    recording_id: str
    key_tonic: str
    key_mode: str
    beats_per_measure: int
    measure_offset: int
    beat_times: list[float]
    segments: list[SegmentOut]


class ChartSettingsUpdate(BaseModel):
    beats_per_measure: int | None = Field(default=None, ge=1, le=16)
    measure_offset: int | None = Field(default=None, ge=0)


class TransposeRequest(BaseModel):
    semitones: int = Field(ge=-11, le=11)
