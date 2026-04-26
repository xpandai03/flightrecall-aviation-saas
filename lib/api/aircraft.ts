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
