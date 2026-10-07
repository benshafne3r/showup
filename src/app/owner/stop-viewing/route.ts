import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { getRealSessionUser } from "@/server/auth/guards";
import { readViewAs, VIEW_AS_COOKIE, VIEWING_FLAG_COOKIE } from "@/server/auth/view-as";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/** Leave "view as" (a GET, so it works while server actions are blocked). */
export async function GET() {
  const viewing = await readViewAs();
  if (viewing) {
    const owner = await getRealSessionUser();
    await audit({
      actorId: owner?.id ?? null,
      actorRole: "owner",
      action: "owner.view_as_stop",
      entityType: "user",
      entityId: viewing.targetId,
    });
  }
  // Behind Railway the request origin is an internal address; use the public URL.
  const response = NextResponse.redirect(`${publicEnv.appUrl}/owner`);
  response.cookies.delete(VIEW_AS_COOKIE);
  response.cookies.delete(VIEWING_FLAG_COOKIE);
  return response;
}
