"use client";

import type { ChecklistImage } from "@/lib/types/database";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

export function fetchAircraftChecklist(
  aircraftId: string,
): Promise<{ images: ChecklistImage[] }> {
  return jsonFetch<{ images: ChecklistImage[] }>(
    `/api/v1/aircraft/${aircraftId}/checklist`,
  );
}

type UploadUrlResponse = {
  media_asset_id: string;
  signed_url: string;
  token: string;
  storage_key: string;
};

/**
 * Upload one checklist image to an aircraft, reusing the signed-URL → PUT →
 * finalize pipeline (same mechanism as session media). The finalize step
 * enforces the 2-image cap server-side (oldest evicted).
 */
export async function uploadChecklistImage(
  aircraftId: string,
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const minted = await jsonFetch<UploadUrlResponse>(
    `/api/v1/aircraft/${aircraftId}/checklist`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: fileName, mime_type: mimeType }),
    },
  );

  const putRes = await fetch(minted.signed_url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`checklist upload PUT failed: ${putRes.status} ${text}`);
  }

  await jsonFetch(
    `/api/v1/aircraft/${aircraftId}/checklist/${minted.media_asset_id}`,
    { method: "PATCH" },
  );
}

export function deleteChecklistImage(
  aircraftId: string,
  mediaId: string,
): Promise<{ id: string }> {
  return jsonFetch<{ id: string }>(
    `/api/v1/aircraft/${aircraftId}/checklist/${mediaId}`,
    { method: "DELETE" },
  );
}
