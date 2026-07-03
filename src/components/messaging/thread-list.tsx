import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { MessagesSquare } from "lucide-react";

export type ThreadSummary = {
  id: string;
  subject: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unread: boolean;
};

export function ThreadList({
  threads,
  basePath,
  activeThreadId,
}: {
  threads: ThreadSummary[];
  basePath: string;
  activeThreadId?: string;
}) {
  if (threads.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations yet"
        description="A thread is created for every request so you can talk logistics."
      />
    );
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            href={`${basePath}/${thread.id}`}
            className={cn(
              "flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/50",
              activeThreadId === thread.id && "bg-muted/60",
            )}
            aria-current={activeThreadId === thread.id ? "true" : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={cn("truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>
                {thread.counterpartName}
                {thread.unread ? (
                  <span className="ml-2 inline-block size-2 rounded-full bg-primary" aria-label="Unread messages" />
                ) : null}
              </p>
              {thread.lastMessageAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(thread.lastMessageAt)}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">{thread.subject}</p>
            {thread.lastMessagePreview ? (
              <p className={cn("truncate text-sm", thread.unread ? "text-foreground" : "text-muted-foreground")}>
                {thread.lastMessagePreview}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
