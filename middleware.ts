import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|placeholder.*\\.png|placeholder.*\\.svg|placeholder.*\\.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
