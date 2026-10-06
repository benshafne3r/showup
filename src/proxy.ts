import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Host-based split (gated on PORTAL_SPLIT=on):
 *   www.showuptickets.com → marketing pages
 *   app.showuptickets.com → sign-in + the authenticated app
 * Inert unless the flag is set, so localhost / railway.app / e2e are unaffected.
 */
const APP_HOST = "app.showuptickets.com";
const WWW_HOST = "www.showuptickets.com";
const APP_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/update-password",
  "/auth",
  "/creator",
  "/label",
  "/manager",
  "/admin",
  "/owner",
  "/join",
];
const MARKETING_PATHS = new Set([
  "/",
  "/how-it-works",
  "/for-creators",
  "/for-labels",
  "/terms",
  "/privacy",
]);

/**
 * Refreshes the Supabase session cookie and gates the app route groups by
 * role claim. This is a convenience layer only — real authorization happens
 * server-side in src/server/auth/guards.ts on every data access.
 */
export default async function proxy(request: NextRequest) {
  // Cross-host redirects run first so they short-circuit before session work.
  if (process.env.PORTAL_SPLIT === "on") {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    const { pathname, search } = request.nextUrl;
    if (host === WWW_HOST) {
      if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return NextResponse.redirect(`https://${APP_HOST}${pathname}${search}`, 307);
      }
    } else if (host === APP_HOST) {
      if (pathname === "/") return NextResponse.redirect(`https://${APP_HOST}/sign-in`, 307);
      if (MARKETING_PATHS.has(pathname)) {
        return NextResponse.redirect(`https://${WWW_HOST}${pathname}`, 308);
      }
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = ["/creator", "/label", "/manager", "/admin", "/owner"].some((p) => path.startsWith(p));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/sign-in" || path === "/sign-up")) {
    // app_metadata.role is set server-side (DB trigger) and can't be edited by
    // the user; fall back to the legacy user_metadata claim for old sessions.
    const role = (user.app_metadata?.role ?? user.user_metadata?.role ?? "creator") as string;
    const url = request.nextUrl.clone();
    url.pathname =
      role === "label" ? "/label" : role === "manager" ? "/manager" : role === "admin" ? "/admin" : "/creator";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
