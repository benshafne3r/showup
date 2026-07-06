import { NextResponse, type NextRequest } from "next/server";
import { userDb } from "@/server/db/server-client";
import { log, errorFields } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * OAuth/PKCE callback. Exchanges the `code` from an email link (password reset,
 * email confirmation) for a session cookie, then forwards to `next`. On failure
 * it sends the user back to the reset flow with a friendly message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  // Only ever redirect to a same-origin relative path.
  const next = nextParam.startsWith("/") ? nextParam : "/";

  if (code) {
    const db = await userDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    log.error("Auth code exchange failed", errorFields(error));
  }

  const failed = new URL("/forgot-password", origin);
  failed.searchParams.set("error", "expired");
  return NextResponse.redirect(failed);
}
