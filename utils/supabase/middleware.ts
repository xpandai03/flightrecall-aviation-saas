import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const PUBLIC_PATHS = ["/login", "/signup", "/auth/", "/api/v1/"];
const AUTH_PAGES = ["/login", "/signup"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AIRCRAFT_PATH_RE = /^\/aircraft\/([^/]+)(?:\/|$)/;

function isPublicPath(path: string): boolean {
  if (path === "/") return false;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
}

function isAuthPage(path: string): boolean {
  return AUTH_PAGES.some((p) => path === p || path.startsWith(p + "/"));
}

function aircraftIdFromPath(path: string): string | null {
  const m = path.match(AIRCRAFT_PATH_RE);
  if (!m) return null;
  return UUID_RE.test(m[1]) ? m[1] : null;
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

  // Cookie writes are legal here (middleware), unlike from Server Components.
  // When the user is on an /aircraft/<uuid>/* page, stamp the
  // last_aircraft_id cookie so the root smart-redirect can return them
  // here next time. Only do this for valid UUIDs to avoid stamping junk
  // (e.g. /aircraft/foo/bar where foo isn't a real id).
  if (user) {
    const aircraftId = aircraftIdFromPath(path);
    if (aircraftId) {
      supabaseResponse.cookies.set("last_aircraft_id", aircraftId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
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
