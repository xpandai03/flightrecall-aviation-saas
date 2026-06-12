"use client";

import type { Aircraft } from "@/lib/types/database";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

export function listMyAircraft(): Promise<Aircraft[]> {
  return jsonFetch<Aircraft[]>("/api/v1/aircraft");
}

export function createAircraft(body: {
  tail_number: string;
  aircraft_type?: string;
}): Promise<Aircraft> {
  return jsonFetch<Aircraft>("/api/v1/aircraft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Shared aircraft (Phase 2): invite-code join ----------------------

/** Redeem an invite code → join its aircraft as a pilot. Returns the
 *  joined aircraft. Throws on an invalid/revoked/expired code. */
export function joinAircraftByCode(code: string): Promise<Aircraft> {
  return jsonFetch<Aircraft>("/api/v1/aircraft/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

/** Owner-only: read the aircraft's current active invite code (or null). */
export function getAircraftInvite(
  aircraftId: string,
): Promise<{ code: string | null }> {
  return jsonFetch<{ code: string | null }>(
    `/api/v1/aircraft/${aircraftId}/invite`,
  );
}

/** Owner-only: generate/regenerate the aircraft's invite code. */
export function generateAircraftInvite(
  aircraftId: string,
): Promise<{ code: string }> {
  return jsonFetch<{ code: string }>(`/api/v1/aircraft/${aircraftId}/invite`, {
    method: "POST",
  });
}

/** Owner-only: revoke the active invite code. */
export function revokeAircraftInvite(
  aircraftId: string,
): Promise<{ ok: boolean }> {
  return jsonFetch<{ ok: boolean }>(`/api/v1/aircraft/${aircraftId}/invite`, {
    method: "DELETE",
  });
}
