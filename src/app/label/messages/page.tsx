import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { listThreadsFor } from "@/server/services/messaging-queries";
import { PageHeader } from "@/components/page-header";
import { ThreadList } from "@/components/messaging/thread-list";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function LabelMessagesPage() {
  const context = await requireLabelPage();
  const threads = await listThreadsFor({
    id: context.user.id,
    side: "company",
    companyId: context.companyId,
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Conversations with creators." />
      <ThreadList threads={threads} basePath="/label/messages" />
    </div>
  );
}
