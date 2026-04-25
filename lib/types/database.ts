export type InputType = "photo" | "voice" | "no_issues";
export type StatusColor = "green" | "yellow" | "red";
export type MediaType = "photo" | "audio";
export type UploadStatus = "pending" | "uploaded" | "failed";
export type QuickTag = "scratch" | "dent" | "tire" | "oil" | "other";
export type TranscriptionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type Aircraft = {
  id: string;
  tail_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  created_at: string;
  updated_at: string;
};

export type PreflightSession = {
  id: string;
  aircraft_id: string;
  input_type: InputType;
  status_color: StatusColor | null;
  notes_text: string | null;
  transcript_text: string | null;
  created_at: string;
  finalized_at: string | null;
};

export type MediaAsset = {
  id: string;
  preflight_session_id: string;
  media_type: MediaType;
  storage_key: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  upload_status: UploadStatus;
  quick_tag: QuickTag | null;
  created_at: string;
};

export type VoiceTranscription = {
  id: string;
  media_asset_id: string;
  preflight_session_id: string;
  transcription_status: TranscriptionStatus;
  transcript_text: string | null;
  language: string | null;
  duration_seconds: number | null;
  model: string;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type PreflightSessionWithMedia = PreflightSession & {
  media_assets: MediaAsset[];
  voice_transcriptions: VoiceTranscription[];
};
