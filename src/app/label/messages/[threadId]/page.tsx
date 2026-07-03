import { notFound } from "next/navigation";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { getThreadForViewer } from "@/server/services/messaging-queries";
import { markThreadRead } from "@/server/services/messaging";
import { ThreadView } from "@/components/messaging/thread-view";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LabelThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const context = await requireLabelPage();
  const { threadId } = await params;
  const thread = await getThreadForViewer(threadId, {
    id: context.user.id,
    side: "company",
    companyId: context.companyId,
  });
  if (!thread) notFound();
  await markThreadRead(context.user.id, threadId);

  return (
    <div className="space-y-4">
      <Link
        href="/label/messages"
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
