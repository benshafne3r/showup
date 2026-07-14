import { redirect } from "next/navigation";

// My requests were merged into the Messages tab. Keep this route as a redirect
// so existing links, bookmarks, and the post-submit flow still resolve.
export default async function CreatorRequestsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  redirect(`/creator/messages?tab=requests${submitted ? "&submitted=1" : ""}`);
}
