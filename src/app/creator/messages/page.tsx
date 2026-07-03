import type { Metadata } from "next";
import { requireCreator } from "@/server/auth/guards";
import { listThreadsFor } from "@/server/services/messaging-queries";
import { PageHeader } from "@/components/page-header";
import { ThreadList } from "@/components/messaging/thread-list";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function CreatorMessagesPage() {
  const user = await requireCreator();
  const threads = await listThreadsFor({ id: user.id, side: "creator" });
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Talk logistics with artist teams." />
      <ThreadList threads={threads} basePath="/creator/messages" />
    </div>
  );
}
