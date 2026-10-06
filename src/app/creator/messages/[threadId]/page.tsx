import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireCreator } from "@/server/auth/guards";
import { getThreadForViewer } from "@/server/services/messaging-queries";
import { markThreadRead } from "@/server/services/messaging";
import { agencyForCreator } from "@/server/services/agencies";
import { ThreadView } from "@/components/messaging/thread-view";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreatorThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await requireCreator();
  const { threadId } = await params;
  // Represented creators' label threads belong to their management company.
  if (await agencyForCreator(user.id)) redirect("/creator/messages?tab=messages");
  const thread = await getThreadForViewer(threadId, { id: user.id, side: "creator" });
  if (!thread) notFound();
  await markThreadRead(user.id, threadId);

  return (
    <div className="space-y-4">
      <Link
        href="/creator/messages"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All messages
      </Link>
      <ThreadView
        threadId={threadId}
        subject={thread.subject}
        counterpartName={thread.counterpartName}
        messages={thread.messages}
      />
    </div>
  );
}
