/**
 * Fills managed creators' missing or placeholder profile photos from their
 * TikTok (TikWM Pro), copied into our avatars bucket.
 *
 *   npm run photos:refresh [-- --handles a,b] [-- --dry-run]
 *
 * Reads the env it runs in (.env.local by default). For prod, run it inside
 * Railway's env, which has the TikWM key:
 *   railway run --service showup -- npm run photos:refresh
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { copyAvatarToStorage, PLACEHOLDER_AVATAR_BYTES } from "../src/lib/managed-profiles";
import { lookupTikTokUser } from "../src/server/providers/social-metrics/tikwm";

config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const handlesArg = args[args.indexOf("--handles") + 1];
const onlyHandles = args.includes("--handles") ? new Set(handlesArg.toLowerCase().split(",")) : null;

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** No photo, or one too small to be a real photo. */
async function needsPhoto(url: string | null): Promise<boolean> {
  if (!url) return true;
  const res = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (!res?.ok) return true;
  return Number(res.headers.get("content-length") ?? PLACEHOLDER_AVATAR_BYTES) < PLACEHOLDER_AVATAR_BYTES;
}

async function main() {
  if (!process.env.TIKWM_API_KEY) throw new Error("TIKWM_API_KEY isn't set in this env (it's in Railway)");
  const { data: creators, error } = await db
    .from("users")
    .select("id, full_name, avatar_url, creator_profiles(creator_social_accounts(platform, handle))")
    .eq("managed_profile", true);
  if (error) throw new Error(error.message);

  let fixed = 0;
  for (const c of creators) {
    const handle = c.creator_profiles?.creator_social_accounts.find((a) => a.platform === "tiktok")?.handle?.toLowerCase();
    if (!handle || (onlyHandles && !onlyHandles.has(handle))) continue;
    if (!onlyHandles && !(await needsPhoto(c.avatar_url))) continue;
    const tiktok = await lookupTikTokUser(handle);
    if (!tiktok?.avatarUrl) {
      console.log(`@${handle}: no TikTok photo found`);
      continue;
    }
    if (dryRun) {
      console.log(`@${handle}: would copy TikTok photo`);
      continue;
    }
    const url = await copyAvatarToStorage(db, c.id, tiktok.avatarUrl);
    if (!url) {
      console.log(`@${handle}: couldn't copy the photo`);
      continue;
    }
    const { error: updateErr } = await db.from("users").update({ avatar_url: url }).eq("id", c.id);
    if (updateErr) throw new Error(updateErr.message);
    console.log(`@${handle}: photo updated (${c.full_name})`);
    fixed++;
  }
  console.log(`${fixed} photo${fixed === 1 ? "" : "s"} updated`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
