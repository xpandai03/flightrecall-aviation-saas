import { smartRedirect } from "@/lib/auth/smart-redirect";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  await smartRedirect("dashboard");
  return null;
}
