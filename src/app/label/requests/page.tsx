import { redirect } from "next/navigation";

// Requests were merged into the Messages tab. Keep this route as a redirect so
// existing links, bookmarks, and revalidations still resolve.
export default function LabelRequestsRedirect() {
  redirect("/label/messages?tab=requests");
}
