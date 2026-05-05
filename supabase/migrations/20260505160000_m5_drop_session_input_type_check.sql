-- =====================================================================
-- M5 #1 — Drop preflight_sessions.input_type CHECK constraint
--
-- Phase 1 of M2 punch-list: a preflight session must hold many inputs
-- (voice + photo + notes, in any combination). The legacy CHECK
-- constrained input_type to one of {'photo','voice','no_issues'},
-- which made sense when each session was strictly single-input.
--
-- After this migration:
--   - input_type stays NOT NULL but is unconstrained text.
--   - Convention: input_type stores the FIRST input mode chosen for
--     the session (informational; useful for the legacy single-input
--     view-model in summarizeSession). It is never mutated after the
--     first save.
--   - The application zod schema continues to validate
--     ('photo'|'voice'|'no_issues') on session creation, since those
--     are still the only "first-input modes" the UI surfaces.
--   - finalized_at (already declared on the row in M1) is now wired
--     by the new POST /preflight-sessions/[id]/finalize endpoint.
--
-- Down-migration (commented; not expected to run):
--   alter table public.preflight_sessions
--     add constraint preflight_sessions_input_type_check
--     check (input_type in ('photo','voice','no_issues'));
-- =====================================================================

alter table public.preflight_sessions
  drop constraint if exists preflight_sessions_input_type_check;
