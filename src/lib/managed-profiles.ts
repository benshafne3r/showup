import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Managed profiles: creators with no login, run by their agency (added from a
 * TikTok link, or imported from a roster page by scripts/import-roster.ts).
 */

/** Placeholder sign-in email for a profile nobody logs in to (never emailed). */
export const managedProfileEmail = (handle: string) =>
  `tt-${handle.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}@profiles.showup.invalid`;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Copy a profile photo into our avatars bucket (managed/<userId>), since
 * TikTok's photo links expire. Only jpeg/png/webp up to 5 MB; null on any
 * failure (the profile just shows initials).
 */
export async function copyAvatarToStorage(
  db: SupabaseClient<Database>,
  userId: string,
  src: string,
): Promise<string | null> {
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = AVATAR_TYPES[type];
    if (!ext || Number(res.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_AVATAR_BYTES) return null;
    const path = `managed/${userId}.${ext}`;
    const { error } = await db.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: true });
    if (error) return null;
    return db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
