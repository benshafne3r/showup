/**
 * Import (or re-sync) an agency's roster from a CreatorCore roster page as
 * managed profiles: creators with no login, run entirely by the agency.
 *
 *   npm run roster:import -- --agency "Spark House" --url https://sparkhouse.creatorcore.co/roster/spark-house-group [--prod] [--dry-run]
 *
 * Reads the page in a headless browser, then for each creator: creates (or
 * updates) the profile, copies their TikTok photo into our storage, saves
 * location, tags and follower counts, and puts them on the agency's roster.
 * Matched by TikTok handle, so re-running updates instead of duplicating.
 * Rates on the page are deliberately ignored.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import type { Database } from "../src/lib/database.types";
import { parseFollowerCount, parseRosterLocation } from "../src/lib/roster";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const prod = args.includes("--prod");
const dryRun = args.includes("--dry-run");
config({ path: prod ? ".env.production.local" : ".env.local" });

const agencyName = flag("agency");
const pageUrl = flag("url");
if (!agencyName || !pageUrl) {
  console.error('Usage: npm run roster:import -- --agency "Name" --url https://….creatorcore.co/roster/… [--prod] [--dry-run]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(`Missing Supabase URL / service key in ${prod ? ".env.production.local" : ".env.local"}`);
  process.exit(1);
}
const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Scraped = {
  name: string | null;
  handle: string | null;
  location: string | null;
  tags: string[];
  followers: Record<string, string>;
  avatar: string | null;
};

/**
 * Runs in the page. A plain string, because tsx rewrites inline functions
 * with helpers that don't exist in the browser.
 */
const EXTRACT_CARDS = `(() => {
  const cards = [...document.querySelectorAll(".baTaLcu > .group-item")];
  const creators = cards.map((c) => {
    const t = (s) => (c.querySelector(s)?.textContent || "").replace(/\\s+/g, " ").trim() || null;
    const followers = {};
    c.querySelectorAll("svg title").forEach((ti) => {
      let box = ti.closest('[id$="-TT"], .baTaLee, .baTaLel') || ti.parentElement;
      for (let i = 0; i < 8 && box && !/[0-9.]+[KMB]?$/.test((box.textContent || "").trim()); i++) box = box.parentElement;
      const m = box && (box.textContent || "").trim().match(/([0-9.,]+[KMB]?)\\s*$/);
      if (m) followers[(ti.textContent || "").trim()] = m[1];
    });
    const avatarEl = c.querySelector(".baTaLfaO");
    const bg = avatarEl ? getComputedStyle(avatarEl).backgroundImage : null;
    const loc = t(".baTaSaGj");
    const handle = t(".baTaLeaP");
    return {
      name: t(".baTaLeaO"),
      handle: handle ? handle.replace(/^@/, "") : null,
      location: loc === "N/A" ? null : loc,
      tags: [...c.querySelectorAll(".baTaLeaL")]
        .map((e) => (e.textContent || "").trim())
        .filter((x) => x && !/^\\+\\d+ Tag$/.test(x)),
      followers,
      avatar: bg && bg !== "none" ? bg.slice(5, -2) : null,
    };
  });
  const label = [...document.querySelectorAll("div")].find((d) => (d.textContent || "").trim() === "Total Creators");
  const totalText = label && label.nextElementSibling ? label.nextElementSibling.textContent : null;
  return { creators, total: totalText ? Number(totalText.replace(/\\D/g, "")) : null };
})()`;

/** Load the roster page and read every creator card. */
async function scrape(): Promise<{ creators: Scraped[]; total: number | null }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pageUrl!, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector(".baTaLcu > .group-item", { timeout: 30_000 });
    // Cards render in batches; wait until the count stops growing.
    let last = -1;
    for (let i = 0; i < 20; i++) {
      const n = await page.locator(".baTaLcu > .group-item").count();
      if (n === last) break;
      last = n;
      await page.waitForTimeout(750);
    }
    return (await page.evaluate(EXTRACT_CARDS)) as { creators: Scraped[]; total: number | null };
  } finally {
    await browser.close();
  }
}

/** Placeholder sign-in email for a profile nobody logs in to (never emailed). */
const profileEmail = (handle: string) =>
  `tt-${handle.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}@profiles.showup.invalid`;

async function copyAvatar(userId: string, src: string): Promise<string | null> {
  try {
    // CreatorCore serves a 96px crop; ask its image CDN for a sharper one.
    const res = await fetch(src.replace(/w=\d+,h=\d+/, "w=256,h=256"));
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `managed/${userId}.${ext}`;
    const { error } = await db.storage
      .from("avatars")
      .upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: true });
    if (error) return null;
    return db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function main() {
  const { data: agency } = await db.from("agencies").select("id, name").ilike("name", agencyName!).maybeSingle();
  if (!agency) throw new Error(`No agency named "${agencyName}"`);
  const { data: owner } = await db
    .from("agency_members")
    .select("user_id")
    .eq("agency_id", agency.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  console.log(`Reading ${pageUrl} …`);
  const { creators, total } = await scrape();
  console.log(`Found ${creators.length} creators${total ? ` (page says ${total})` : ""}.`);
  if (total && total !== creators.length) console.warn("⚠️  Count doesn't match the page total; some cards may not have loaded.");
  if (dryRun) {
    for (const c of creators) console.log(`  @${c.handle} · ${c.name} · ${c.location ?? "no location"} · ${JSON.stringify(c.followers)}`);
    return;
  }

  let created = 0;
  let updated = 0;
  const problems: string[] = [];
  for (const c of creators) {
    if (!c.handle) {
      problems.push(`${c.name ?? "?"}: no handle`);
      continue;
    }
    const handle = c.handle.toLowerCase();
    const email = profileEmail(handle);
    const name = (c.name ?? "").trim() || handle;

    let { data: user } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      if (error || !data.user) {
        problems.push(`@${handle}: ${error?.message ?? "could not create"}`);
        continue;
      }
      user = { id: data.user.id };
      created++;
    } else {
      updated++;
    }

    const avatarUrl = c.avatar ? await copyAvatar(user.id, c.avatar) : null;
    await db
      .from("users")
      .update({ full_name: name, managed_profile: true, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
      .eq("id", user.id);

    const loc = parseRosterLocation(c.location);
    const followers = {
      tiktok: parseFollowerCount(c.followers.tiktok),
      instagram: parseFollowerCount(c.followers.instagram),
      youtube: parseFollowerCount(c.followers.youtube),
    };
    const { data: existing } = await db.from("creator_profiles").select("id, onboarded_at").eq("user_id", user.id).maybeSingle();
    const { data: profile, error: profileError } = await db
      .from("creator_profiles")
      .upsert(
        {
          user_id: user.id,
          city: loc.city,
          region: loc.region,
          country: loc.country || "US",
          categories: [...new Set(c.tags)],
          audience_size: followers.tiktok + followers.instagram + followers.youtube,
          onboarded_at: existing?.onboarded_at ?? new Date().toISOString(),
          new_show_alerts: false,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (profileError || !profile) {
      problems.push(`@${handle}: profile ${profileError?.message}`);
      continue;
    }

    // Only the TikTok handle is known; other platforms carry follower counts.
    await db.from("creator_social_accounts").delete().eq("profile_id", profile.id);
    const socials = (["tiktok", "instagram", "youtube"] as const)
      .filter((p) => followers[p] > 0)
      .map((p) => ({
        profile_id: profile.id,
        platform: p,
        handle: p === "tiktok" ? handle : "",
        url: p === "tiktok" ? `https://www.tiktok.com/@${handle}` : null,
        followers: followers[p],
      }));
    if (socials.length) await db.from("creator_social_accounts").insert(socials);

    const { data: link } = await db.from("agency_creators").select("agency_id").eq("creator_id", user.id).maybeSingle();
    if (!link) {
      await db.from("agency_creators").insert({ agency_id: agency.id, creator_id: user.id, added_by: owner?.user_id ?? null });
    } else if (link.agency_id !== agency.id) {
      problems.push(`@${handle}: already on another agency's roster`);
    }
  }

  console.log(`\n${agency.name}: ${created} added, ${updated} updated.`);
  if (problems.length) console.log(`Problems:\n  ${problems.join("\n  ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
