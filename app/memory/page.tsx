import { smartRedirect } from "@/lib/auth/smart-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyMemoryPage() {
  await smartRedirect("memory");
  return null;
}
