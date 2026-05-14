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
  user_id: string;
  tail_number: string;
  aircraft_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  email: string | null;
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

export type IssueCategory =
  | "engine_oil"
  | "structural"
  | "landing_gear"
  | "fuel"
  | "electrical"
  | "flight_controls"
  | "general_safety";

export type IssueSeverityClass = "critical" | "cosmetic";

export type IssueType = {
  id: string;
  // M5 widened from QuickTag to string: the V1 keyword-detection
  // taxonomy adds ~30 new slugs alongside the legacy 5 quick-tags.
  slug: string;
  name: string;
  category: IssueCategory | null;
  /** Type-level M3 bucket; not recency-based (see lib/issue-derivation IssueSeverity). */
  severity_class: IssueSeverityClass;
  created_at: string;
};

export type Issue = {
  id: string;
  aircraft_id: string;
  issue_type_id: string;
  description: string | null;
  // M5: location pulled from voice transcripts via lib/issue-extraction.ts.
  // NULL on legacy photo-quick-tag rows (no location signal at upload time).
  location: string | null;
  current_status: IssueStatus;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  /** M3 Item 3: short AI prose; null until generated or on failure. */
  ai_summary: string | null;
  /** Set when a summary attempt finishes (success or failure) or backfilled. */
  ai_summary_updated_at: string | null;
};

export type IssueWithType = Issue & {
  issue_type: IssueType;
};

export type ActiveIssue = IssueWithType & {
  flights_since: number;
};

/** Active issue + dashboard / preflight enrichment (M3 Item 2). */
export type ActiveIssueEnriched = ActiveIssue & {
  originating_session_id: string | null;
  recurrence_count: number;
};

export type ActiveIssuesBySeverity = {
  critical: ActiveIssueEnriched[];
  cosmetic: ActiveIssueEnriched[];
};

export type IssueObservation = {
  id: string;
  issue_id: string;
  preflight_session_id: string;
  action: IssueAction;
  // M5: per-observation evidence preserved separately from the rolled-
  // up issues row. Populated by lib/issue-extraction.ts at logging time;
  // NULL on legacy photo-quick-tag observations and on still/fixed/
  // skipped actions (no transcript context).
  raw_transcript: string | null;
  summary: string | null;
  created_at: string;
};

export type IssueObservationDetail = IssueObservation & {
  issue: IssueWithType;
};

/** `active_issue_count` is critical-severity actives only (cosmetic excluded). */
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
