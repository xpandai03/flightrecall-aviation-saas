import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const PUBLIC_PATHS = ["/login", "/signup", "/auth/", "/api/v1/"];
const AUTH_PAGES = ["/login", "/signup"];

function isPublicPath(path: string): boolean {
  if (path === "/") return false;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
}

function isAuthPage(path: string): boolean {
  return AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Per-request session refresh + auth gating.
 *
 * - Refreshes the Supabase session cookie via getUser() on every request.
 * - Redirects unauthenticated users hitting protected pages to /login?next=...
 * - Redirects authenticated users hitting /login or /signup back to /.
 * - Leaves /api/* routes alone (they handle 401s themselves so clients
 *   get clean error responses, not redirects).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Kept for compatibility with the canonical Supabase helper shape.
export const createClient = (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  return supabaseResponse;
};
