import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MessageComposer } from "./message-composer";
import { Paperclip, TicketCheck } from "lucide-react";

export type ThreadMessage = {
  id: string;
  senderName: string;
  mine: boolean;
  kind: "text" | "attachment" | "ticket_instructions" | "system";
  body: string;
  attachments: { url: string | null; label: string }[];
  createdAt: string;
};

export function ThreadView({
  threadId,
  subject,
  counterpartName,
  messages,
}: {
  threadId: string;
  subject: string;
  counterpartName: string;
  messages: ThreadMessage[];
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <p className="font-medium">{counterpartName}</p>
        <p className="text-xs text-muted-foreground">{subject}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-label="Messages" role="log">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — say hi and talk logistics.
          </p>
        ) : (
          messages.map((message) =>
            message.kind === "ticket_instructions" ? (
              <div
                key={message.id}
                className="mx-auto w-full max-w-md rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm"
              >
                <p className="mb-1 flex items-center gap-1.5 font-medium text-primary">
                  <TicketCheck className="size-4" aria-hidden /> Ticket instructions
                </p>
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</p>
              </div>
            ) : (
              <div
                key={message.id}
                className={cn("flex flex-col gap-1", message.mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap sm:max-w-[70%]",
                    message.mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted",
                  )}
                >
                  {message.body}
                  {message.attachments.map((attachment, index) =>
                    attachment.url ? (
                      <a
                        key={index}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "mt-1 flex items-center gap-1 text-xs underline",
                          message.mine ? "text-primary-foreground/90" : "text-primary",
                        )}
                      >
                        <Paperclip className="size-3" aria-hidden /> {attachment.label}
                      </a>
                    ) : null,
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {message.senderName} · {formatDateTime(message.createdAt)}
                </span>
              </div>
            ),
          )
        )}
      </div>
      <MessageComposer threadId={threadId} />
    </div>
  );
}
