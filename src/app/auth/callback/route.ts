import { NextResponse, type NextRequest } from "next/server";
import { userDb } from "@/server/db/server-client";
import { destinationFor } from "@/server/auth/destination";
import { log, errorFields } from "@/server/log";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * OAuth/PKCE callback. Exchanges the `code` from an email link (password reset,
 * email confirmation) for a session cookie, then forwards the user on. On
 * failure it sends them back to the reset flow with a friendly message.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Build redirects from the configured public URL, not request.nextUrl.origin:
  // behind Railway's proxy the request origin is the internal host (localhost:8080).
  const origin = publicEnv.appUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  // Only ever honor a same-origin relative path.
  const explicitNext = nextParam?.startsWith("/") ? nextParam : null;

  if (code) {
    const db = await userDb();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      // Password reset passes an explicit next (/update-password); email
      // confirmation passes none, so route to the role-appropriate landing.
      const dest = explicitNext ?? (data.user ? await destinationFor(data.user.id) : "/");
      return NextResponse.redirect(`${origin}${dest}`);
    }
    log.error("Auth code exchange failed", errorFields(error));
  }

  const failed = new URL("/forgot-password", origin);
  failed.searchParams.set("error", "expired");
  return NextResponse.redirect(failed);
}
