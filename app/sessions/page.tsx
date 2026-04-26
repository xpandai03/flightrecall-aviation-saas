import { smartRedirect } from "@/lib/auth/smart-redirect";

export const dynamic = "force-dynamic";

export default async function LegacySessionsPage() {
  await smartRedirect("sessions");
  return null;
}
