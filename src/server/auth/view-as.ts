import "server-only";

import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { sessionClient } from "@/server/db/server-client";
import { isPlatformOwner } from "./owner-emails";

/**
 * Owner-only, read-only "view as": the owner sees the app as another user.
 * A signed, httpOnly cookie names the target; it only takes effect when the
 * real signed-in user is a platform owner, and expires after an hour. The
 * proxy refuses every server action while it's set (nothing can be changed).
 */
export const VIEW_AS_COOKIE = "showup_view_as";
/** Readable by the browser; carries no identity, only "viewing is on". */
export const VIEWING_FLAG_COOKIE = "showup_viewing";
const TTL_SECONDS = 60 * 60;

function sign(payload: string): string {
  return createHmac("sha256", serverEnv.supabaseServiceRoleKey).update(`view-as:${payload}`).digest("base64url");
}

export function viewAsCookieValue(targetId: string, ownerId: string): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${targetId}.${ownerId}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: TTL_SECONDS };
}

/** The real (cookie-session) auth user, ignoring any "view as". */
export const realAuthUser = cache(async () => {
  const db = await sessionClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user;
});

/** The active "view as" target, verified; null when not viewing as anyone. */
export const readViewAs = cache(async (): Promise<{ targetId: string; ownerId: string } | null> => {
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const [targetId, ownerId, exp, sig] = raw.split(".");
  if (!targetId || !ownerId || !exp || !sig) return null;
  const expected = Buffer.from(sign(`${targetId}.${ownerId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;

  const real = await realAuthUser();
  if (!real || real.id !== ownerId || !isPlatformOwner(real.email)) return null;
  return { targetId, ownerId };
});
