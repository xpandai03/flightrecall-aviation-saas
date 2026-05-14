-- =====================================================================
-- M3 Item 3 — Per-issue AI summary (issues.ai_summary)
--
-- Distinct from issue_observations.summary (M5 extraction phrase per row).
-- Populated server-side; see lib/issue-summarization.ts.
-- =====================================================================

alter table public.issues
  add column if not exists ai_summary text;

alter table public.issues
  add column if not exists ai_summary_updated_at timestamptz;

-- Legacy / pre-rollout rows: avoid "Generating…" spinner forever in UI.
update public.issues
   set ai_summary_updated_at = now()
 where ai_summary is null
   and ai_summary_updated_at is null;
