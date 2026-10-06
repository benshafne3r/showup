import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManagerPage } from "../../require-manager";
import { isOnRoster } from "@/server/services/agencies";
import { getCreatorPublicProfile } from "@/server/services/profiles";
import { serviceDb } from "@/server/db/service";
import { removeCreatorAction } from "../../actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_STATUS_META, REQUEST_STATUS_META } from "@/lib/statuses";
import { formatShowDate } from "@/lib/dates";
import { ArrowLeft, CalendarPlus } from "lucide-react";

export const metadata: Metadata = { title: "Creator" };
export const dynamic = "force-dynamic";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default async function ManagedCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManagerPage();
  const { id } = await params;
  if (!(await isOnRoster(ctx.agencyId, id))) notFound();

  const db = serviceDb();
  const [{ data: user }, publicProfile, { data: card }, { data: requests }, { data: bookings }] =
    await Promise.all([
      db.from("users").select("full_name, email").eq("id", id).single(),
      getCreatorPublicProfile(id),
      db.from("payment_methods").select("brand, last4").eq("user_id", id).eq("is_default", true).maybeSingle(),
      db
        .from("show_requests")
        .select("id, status, ticket_count, created_at, shows!inner(date, artists(name), venues(city))")
        .eq("creator_id", id)
        .in("status", ["pending", "waitlisted"])
        .order("created_at", { ascending: false }),
      db
        .from("bookings")
        .select("id, status, shows!inner(date, artists(name), venues(city))")
        .eq("creator_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
  const profile = publicProfile?.profile;
  const socials = profile?.creator_social_accounts ?? [];
  const name = user?.full_name || user?.email || "Creator";

  return (
    <div className="space-y-6">
      <Link href="/manager" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>
      <PageHeader
        title={name}
        description={[profile?.city, user?.email].filter(Boolean).join(" · ")}
        action={
          <Button asChild>
            <Link href={`/manager/shows?for=${id}`}>
              <CalendarPlus className="size-4" aria-hidden /> Find shows for {name.split(" ")[0]}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open requests</CardTitle>
            </CardHeader>
            <CardContent>
              {!requests?.length ? (
                <p className="text-sm text-muted-foreground">No open requests.</p>
              ) : (
                <ul className="space-y-2">
                  {requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        {r.shows.artists?.name} · {r.shows.venues?.city} · {formatShowDate(r.shows.date)}
                      </span>
                      <StatusBadge {...REQUEST_STATUS_META[r.status]} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {!bookings?.length ? (
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <ul className="space-y-2">
                  {bookings.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/manager/bookings/${b.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <span>
                          {b.shows.artists?.name} · {b.shows.venues?.city} · {formatShowDate(b.shows.date)}
                        </span>
                        <StatusBadge {...BOOKING_STATUS_META[b.status]} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Card for holds: </span>
                {card ? `${card.brand} ••${card.last4}` : "Not added yet. They add it from their own login."}
              </p>
              {profile ? (
                <p>
                  <span className="text-muted-foreground">Audience: </span>
                  {compact.format(profile.audience_size)} · avg {compact.format(profile.avg_views)} views
                </p>
              ) : null}
              {socials.length ? (
                <ul className="space-y-1">
                  {socials.map((s) => (
                    <li key={`${s.platform}-${s.handle}`}>
                      {s.platform} @{s.handle}
                      <span className="text-muted-foreground"> · {compact.format(s.followers)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {profile?.bio ? <p className="text-muted-foreground">{profile.bio}</p> : null}
              {!profile?.onboarded_at ? (
                <p className="text-amber-300">They haven&apos;t finished their profile yet.</p>
              ) : null}
            </CardContent>
          </Card>
          <ConfirmActionButton
            action={removeCreatorAction}
            fields={{ creatorId: id }}
            triggerLabel="Remove from roster"
            title={`Remove ${name} from your roster?`}
            description="Their label conversations and future payouts go back to them directly. Existing requests and bookings stay as they are."
            confirmLabel="Remove"
            cancelLabel="Keep"
          />
        </div>
      </div>
    </div>
  );
}
