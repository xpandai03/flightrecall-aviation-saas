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
  issue_id: string | null;
  created_at: string;
};

export type IssueStatus = "active" | "resolved";
export type IssueAction = "logged" | "still" | "fixed" | "skipped";

export type IssueType = {
  id: string;
  slug: QuickTag;
  name: string;
  created_at: string;
};

export type Issue = {
  id: string;
  aircraft_id: string;
  issue_type_id: string;
  description: string | null;
  current_status: IssueStatus;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueWithType = Issue & {
  issue_type: IssueType;
};

export type ActiveIssue = IssueWithType & {
  flights_since: number;
};

export type IssueObservation = {
  id: string;
  issue_id: string;
  preflight_session_id: string;
  action: IssueAction;
  created_at: string;
};

export type IssueObservationDetail = IssueObservation & {
  issue: IssueWithType;
};

export type AircraftStatus = {
  status_color: StatusColor;
  active_issue_count: number;
};

export type AircraftIssuesResponse = {
  active: IssueWithType[];
  resolved: IssueWithType[];
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

export type MediaAssetWithSignedUrl = MediaAsset & {
  signed_url: string | null;
};

export type PreflightSessionDetail = PreflightSession & {
  media_assets: MediaAssetWithSignedUrl[];
  voice_transcriptions: VoiceTranscription[];
  issue_observations: IssueObservationDetail[];
};
