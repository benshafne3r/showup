import Link from "next/link";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/creator/actions";
import { BellOff, Check } from "lucide-react";

/** Shared notification center used by creator, label, and admin apps. */
export async function NotificationsPage({ userId }: { userId: string }) {
  const { data: notifications } = await serviceDb()
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const hasUnread = (notifications ?? []).some((n) => !n.read_at);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        action={
          hasUnread ? (
            <form action={markAllNotificationsReadAction}>
              <Button variant="outline" size="sm" type="submit">
                <Check className="size-4" aria-hidden /> Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />
      {!notifications?.length ? (
        <EmptyState
          icon={BellOff}
          title="Nothing yet"
          description="Updates about requests, bookings, holds, and payments land here."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3",
                !notification.read_at && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="min-w-0 space-y-0.5">
                <p className={cn("text-sm", !notification.read_at && "font-semibold")}>
                  {notification.title}
                </p>
                {notification.body ? (
                  <p className="text-sm text-muted-foreground">{notification.body}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(notification.created_at)}
                </p>
                {notification.link ? (
                  <Link href={notification.link} className="text-sm text-primary hover:underline">
                    View →
                  </Link>
                ) : null}
              </div>
              {!notification.read_at ? (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="submit"
                    aria-label={`Mark "${notification.title}" as read`}
                  >
                    <Check className="size-4" aria-hidden />
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
