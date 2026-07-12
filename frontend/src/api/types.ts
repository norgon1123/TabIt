export interface Credentials {
  username: string;
  password: string;
}

export interface UserOut {
  id: string;
  username: string;
}

export interface AnalysisOut {
  status: "pending" | "running" | "done" | "failed";
  bpm: number | null;
  detected_key_tonic: string | null;
  detected_key_mode: string | null;
  engine_version: string | null;
  error: string | null;
  beat_times: number[];
}

export interface RecordingOut {
  id: string;
  original_filename: string;
  format: string;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  analysis: AnalysisOut | null;
}

export interface SegmentOut {
  id: string;
  start_beat: number;
  end_beat: number;
  start_time: number;
  end_time: number;
  chord_root: string;
  chord_quality: string;
  roman_numeral: string;
}

export interface SegmentWindowInput {
  id: string;
  start_beat: number;
  end_beat: number;
}

export interface ChartOut {
  id: string;
  recording_id: string;
  key_tonic: string;
  key_mode: string;
  beats_per_measure: number;
  measure_offset: number;
  beat_times: number[];
  segments: SegmentOut[];
}
