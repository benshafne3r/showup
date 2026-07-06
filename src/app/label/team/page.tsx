import { redirect } from "next/navigation";

// Team management moved under Settings. Kept as a redirect so existing links,
// bookmarks, and revalidation targets still resolve.
export default function TeamPage() {
  redirect("/label/settings");
}
