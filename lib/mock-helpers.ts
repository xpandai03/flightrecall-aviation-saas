import type { StatusColor } from "@/lib/types/database";

export type Observation = {
  text: string;
  timestamp?: string;
};

export type Session = {
  id: string;
  aircraft: string;
  date: string;
  notes: Observation[];
  photos: string[];
  repeatedFlags: string[];
  statusColor: StatusColor | null;
};

export function recentObservations(sessions: Session[], limit = 3): Observation[] {
  const all: Observation[] = [];
  for (const s of sessions) {
    for (const n of s.notes) {
      if (n.text.toLowerCase().includes("no issues")) continue;
      all.push(n);
    }
    if (all.length >= limit) break;
  }
  return all.slice(0, limit);
}

export function repeatedObservations(sessions: Session[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    for (const n of s.notes) {
      const key = normalize(n.text);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([k]) => k);
}

export function normalize(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("brake softness")) return "Brake softness";
  if (lower.includes("oil residue")) return "Oil residue";
  if (lower.includes("tire wear")) return "Tire wear";
  return "";
}
