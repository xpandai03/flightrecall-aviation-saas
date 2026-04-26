import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  action: z.enum(["still", "fixed", "skipped"]),
  // Optional: when carry-forward fires from the dashboard root (no
  // session yet), we still want to mutate issue state immediately. We
  // skip the observations insert in that case to avoid the NOT NULL FK
  // (V1 trade-off — out-of-band actions don't appear in any session's
  // "Previous actions" history).
  preflight_session_id: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid issue id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: issue, error: loadErr } = await supabase
    .from("issues")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { action, preflight_session_id } = parsed.data;

  let updatedIssue = issue;
  if (action === "still") {
    const { data: u, error: uErr } = await supabase
      .from("issues")
      .update({
        last_seen_at: new Date().toISOString(),
        current_status: "active",
        resolved_at: null,
      })
      .eq("id", issue.id)
      .select()
      .single();
    if (uErr || !u) {
      return NextResponse.json(
        { error: uErr?.message ?? "Failed to update issue" },
        { status: 500 },
      );
    }
    updatedIssue = u;
  } else if (action === "fixed") {
    const { data: u, error: uErr } = await supabase
      .from("issues")
      .update({
        current_status: "resolved",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", issue.id)
      .select()
      .single();
    if (uErr || !u) {
      return NextResponse.json(
        { error: uErr?.message ?? "Failed to update issue" },
        { status: 500 },
      );
    }
    updatedIssue = u;
  }
  // 'skipped' → no issue mutation

  // Only record an observation row when we have a session to attach it
  // to. Out-of-band actions (no session) just mutate issue state.
  let observation: unknown = null;
  if (preflight_session_id) {
    const { data: obs, error: obsErr } = await supabase
      .from("issue_observations")
      .insert({
        issue_id: issue.id,
        preflight_session_id,
        action,
      })
      .select()
      .single();
    if (obsErr || !obs) {
      return NextResponse.json(
        { error: obsErr?.message ?? "Failed to insert observation" },
        { status: 500 },
      );
    }
    observation = obs;
  }

  return NextResponse.json(
    { observation, issue: updatedIssue },
    { status: 201 },
  );
}
