import { notFound } from "next/navigation";
import Link from "next/link";
import { requireManagerPage } from "../../require-manager";
import { getThreadForViewer } from "@/server/services/messaging-queries";
import { markThreadRead } from "@/server/services/messaging";
import { ThreadView } from "@/components/messaging/thread-view";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ManagerThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const ctx = await requireManagerPage();
  const { threadId } = await params;
  const thread = await getThreadForViewer(threadId, {
    id: ctx.user.id,
    side: "manager",
    agencyId: ctx.agencyId,
  });
  if (!thread) notFound();
  await markThreadRead(ctx.user.id, threadId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/manager/messages"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All messages
        </Link>
        <Link href={`/manager/creators/${thread.creatorId}`} className="text-sm text-primary hover:underline">
          View creator
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;re replying on your creator&apos;s behalf — the artist team sees your name and{" "}
        {ctx.agencyName}.
      </p>
      <ThreadView
        threadId={threadId}
        subject={thread.subject}
        counterpartName={thread.counterpartName}
        messages={thread.messages}
      />
    </div>
  );
}
