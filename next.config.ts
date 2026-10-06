import type { NextConfig } from "next";

// Local dev runs Supabase at http://127.0.0.1:54321 (`supabase start`). Next 16
// blocks optimizing images from local IPs unless explicitly allowed, so only
// open that up when the configured Supabase URL is the local stack.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(supabaseUrl);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage public buckets (artist imagery, avatars).
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(localSupabase
        ? [{ protocol: "http" as const, hostname: "127.0.0.1", pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
    dangerouslyAllowLocalIP: localSupabase,
  },
};

export default nextConfig;
