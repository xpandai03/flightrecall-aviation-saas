# Supabase setup — Milestone 1

Auth is intentionally **out of scope** for M1. RLS is **not enabled** on any of these tables. Both will be added in M4.

## 1. Apply the migration

The migration file is `supabase/migrations/0001_m1_schema.sql`. It creates:

- `public.aircraft` (with `normalize_tail_number` trigger)
- `public.preflight_sessions`
- `public.media_assets`

Plus indexes and one seed row in `aircraft` (`N739X`, Cessna 172).

**To run it:**

1. Open the Supabase dashboard for the project.
2. SQL Editor → **New query**.
3. Paste the entire contents of `supabase/migrations/0001_m1_schema.sql`.
4. Run.
5. Verify in Table Editor that the three tables exist and `aircraft` has one row with `tail_number = 'N739X'`.

> No CLI / `supabase db push` is wired up in this repo for M1. We're using the SQL Editor as the source of truth for now.

## 2. Create the Storage bucket

1. Storage → **New bucket**.
2. Name: `flight-recall-media`
3. **Public bucket: OFF** (leave it private).
4. Save.

That's it. No additional bucket policies are needed for M1 because:
- There's no auth, so per-user policies are meaningless.
- All access goes through signed URLs minted by the API routes using the publishable key.

## 3. Confirm and tell Claude to proceed

After (1) and (2) are done, reply with:

> migration applied + bucket created

so the API routes can be written against tables and a bucket that actually exist.
