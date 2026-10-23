import type { Metadata } from "next";
import { formatDistanceToNowStrict } from "date-fns";
import { requireOwnerPage } from "@/server/auth/owner";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AUTHORIZATION_STATUS_META,
  BOOKING_STATUS_META,
  REQUEST_STATUS_META,
} from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { readViewAs } from "@/server/auth/view-as";
import { isPlatformOwner } from "@/server/auth/owner-emails";
import { revokePartnerLinkAction, viewAsAction } from "./actions";
import { PartnerLinkForm } from "./partner-link-form";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { Eye } from "lucide-react";

export const metadata: Metadata = { title: "Owner dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ago = (iso: string) => `${formatDistanceToNowStrict(new Date(iso))} ago`;

const ROLE_TONE = {
  creator: "neutral",
  label: "info",
  manager: "success",
  admin: "warning",
} as const;

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

type OwnerStats = {
  accounts: number;
  new_this_week: number;
  creators: number;
  onboarded_creators: number;
  alerts_on: number;
  roster_profiles: number;
  creators_with_card: number;
  labels: number;
  managers: number;
  agencies: number;
  open_shows: number;
  pending_requests: number;
  active_bookings: number;
  holds_count: number;
  holds_cents: number;
  captured_count: number;
  captured_cents: number;
  paid_cents: number;
  bookings_by_status: Record<string, number>;
};

const SIGNUP_PAGE = 25;

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireOwnerPage();
  const viewing = await readViewAs();
  const params = await searchParams;
  const signupPage = pageOf(params.page, SIGNUP_PAGE);
  const db = serviceDb();
  const now = new Date();

  // Tiles are SQL aggregates over everything; lists are the latest few.
  const [{ data: statsJson, error: statsError }, { data: users }, { data: requests }, { data: holds }, { data: invites }] =
    await Promise.all([
      db.rpc("owner_stats"),
      // Agency-run roster profiles have no login, so they aren't sign-ups.
      db
        .from("users")
        .select("id, full_name, email, role, status, created_at, managed_profile")
        .eq("managed_profile", false)
        .order("created_at", { ascending: false })
        .range(signupPage.from, signupPage.to),
      db
        .from("show_requests")
        .select("id, status, created_at, users:users!creator_id(full_name), shows!inner(date, artists(name), venues(city))")
        .order("created_at", { ascending: false })
        .limit(15),
      db
        .from("authorization_records")
        .select("id, status, amount_cents, created_at, authorized_at, released_at, captured_at, users:users!creator_id(full_name), bookings!inner(shows!inner(date, artists(name)))")
        .order("created_at", { ascending: false })
        .limit(15),
      db
        .from("partner_invites")
        .select("id, kind, org_name, email, created_at, expires_at, used_at, revoked_at, users:used_by(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  if (statsError) throw new Error(`owner stats: ${statsError.message}`);
  const stats = statsJson as unknown as OwnerStats;

  // Setup details for just the sign-ups on this page.
  const all = users ?? [];
  const ids = all.map((u) => u.id);
  const [{ data: profiles }, { data: cards }, { data: companyMembers }, { data: agencyMembers }, { data: rosters }] = ids.length
    ? await Promise.all([
        db.from("creator_profiles").select("user_id, city, onboarded_at").in("user_id", ids),
        db.from("payment_methods").select("user_id").in("user_id", ids),
        db.from("company_members").select("user_id, companies(name)").in("user_id", ids),
        db.from("agency_members").select("user_id, agencies(name)").in("user_id", ids),
        db.from("agency_creators").select("creator_id, agencies(name)").in("creator_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const profileOf = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const withCard = new Set((cards ?? []).map((c) => c.user_id));
  const companyOf = new Map((companyMembers ?? []).map((m) => [m.user_id, m.companies?.name]));
  const agencyOf = new Map((agencyMembers ?? []).map((m) => [m.user_id, m.agencies?.name]));
  const managedBy = new Map((rosters ?? []).map((r) => [r.creator_id, r.agencies?.name]));
  const bookingsByStatus = Object.entries(stats.bookings_by_status ?? {});

  /** One line describing where a signup is in setup. */
  const setupOf = (u: { id: string; role: string }) => {
    if (u.role === "creator") {
      const p = profileOf.get(u.id);
      const bits = [
        p?.onboarded_at ? (p.city || "profile done") : "hasn't finished profile",
        withCard.has(u.id) ? "card on file" : "no card",
        managedBy.get(u.id) ? `managed by ${managedBy.get(u.id)}` : null,
      ];
      return bits.filter(Boolean).join(" · ");
    }
    if (u.role === "label") return companyOf.get(u.id) ?? "hasn't set up a company";
    if (u.role === "manager") return agencyOf.get(u.id) ?? "hasn't set up a company";
    return "";
  };

  return (
    <div className="space-y-8">
      {viewing ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          You&apos;re viewing the app as someone else. Use <span className="font-medium">Stop viewing</span> in
          the banner before viewing another account.
        </p>
      ) : null}
      <PageHeader
        title="Owner dashboard"
        description="Private to you. Live numbers, refreshed every time you open this page. Use View as to see the app exactly as someone else does (read-only)."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a label or management company</CardTitle>
        </CardHeader>
        <CardContent>
          {viewing ? (
            <p className="text-sm text-muted-foreground">Stop viewing as someone to create links.</p>
          ) : (
            <PartnerLinkForm />
          )}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">People</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Tile label="Total accounts" value={stats.accounts} sub={`+${stats.new_this_week} in the last 7 days`} />
          <Tile
            label="Creators"
            value={stats.creators}
            sub={`${stats.onboarded_creators} finished profile · ${stats.alerts_on} want city alerts${stats.roster_profiles ? ` · plus ${stats.roster_profiles} agency roster profiles` : ""}`}
          />
          <Tile label="Creators with a card" value={stats.creators_with_card} />
          <Tile label="Label accounts" value={stats.labels} />
          <Tile label="Management accounts" value={stats.managers} sub={`${stats.agencies} compan${stats.agencies === 1 ? "y" : "ies"} set up`} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="market-heading">
        <h2 id="market-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Marketplace &amp; money</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Tile label="Shows open now" value={stats.open_shows} />
          <Tile label="Pending requests" value={stats.pending_requests} />
          <Tile label="Active bookings" value={stats.active_bookings} />
          <Tile label="Holds on cards" value={formatCents(stats.holds_cents)} sub={`${stats.holds_count} active`} />
          <Tile label="Charged (no-shows)" value={formatCents(stats.captured_cents)} sub={`${stats.captured_count} total`} />
          <Tile label="Paid to creators" value={formatCents(stats.paid_cents)} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent signups</CardTitle>
        </CardHeader>
        <CardContent>
          {!all.length ? (
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
          ) : (
            <ul className="divide-y">
              {all.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {u.full_name || "(no name)"}{" "}
                      <span className="font-normal text-muted-foreground">{u.email}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{setupOf(u)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={u.role} tone={ROLE_TONE[u.role as keyof typeof ROLE_TONE] ?? "neutral"} />
                    {u.status !== "active" ? <StatusBadge label={u.status} tone="danger" /> : null}
                    <span className="text-xs whitespace-nowrap text-muted-foreground" title={formatDateTime(u.created_at)}>
                      {ago(u.created_at)}
                    </span>
                    {!viewing && !isPlatformOwner(u.email) ? (
                      <form action={viewAsAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Button type="submit" variant="outline" size="sm" aria-label={`View as ${u.full_name || u.email}`}>
                          <Eye className="size-3.5" aria-hidden /> View as
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pager page={signupPage.page} size={SIGNUP_PAGE} total={stats.accounts} basePath="/owner" params={params} className="mt-3" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Card holds</CardTitle>
          </CardHeader>
          <CardContent>
            {!holds?.length ? (
              <p className="text-sm text-muted-foreground">No holds yet.</p>
            ) : (
              <ul className="divide-y">
                {holds.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">
                        {formatCents(h.amount_cents)}{" "}
                        <span className="font-normal text-muted-foreground">{h.users?.full_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {h.bookings.shows.artists?.name} · {formatShowDate(h.bookings.shows.date)} ·{" "}
                        {ago(h.captured_at ?? h.released_at ?? h.authorized_at ?? h.created_at)}
                      </p>
                    </div>
                    <StatusBadge {...AUTHORIZATION_STATUS_META[h.status]} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent requests</CardTitle>
          </CardHeader>
          <CardContent>
            {!requests?.length ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              <ul className="divide-y">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{r.users?.full_name ?? "Creator"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.shows.artists?.name} · {r.shows.venues?.city} · {formatShowDate(r.shows.date)} · {ago(r.created_at)}
                      </p>
                    </div>
                    <StatusBadge {...REQUEST_STATUS_META[r.status]} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings by status</CardTitle>
          </CardHeader>
          <CardContent>
            {!bookingsByStatus.length ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {bookingsByStatus.map(([status, n]) => (
                  <li key={status} className="flex items-center justify-between gap-2">
                    <StatusBadge {...BOOKING_STATUS_META[status as keyof typeof BOOKING_STATUS_META]} />
                    <span className="font-medium tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Private partner links</CardTitle>
          </CardHeader>
          <CardContent>
            {!invites?.length ? (
              <p className="text-sm text-muted-foreground">No links made yet.</p>
            ) : (
              <ul className="divide-y">
                {invites.map((i) => {
                  const state = i.revoked_at
                    ? { label: "revoked", tone: "neutral" as const }
                    : i.used_at
                      ? { label: "used", tone: "success" as const }
                      : new Date(i.expires_at) < now
                        ? { label: "expired", tone: "neutral" as const }
                        : { label: "open", tone: "info" as const };
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {i.kind === "label" ? "Label" : "Management"} link
                          {i.org_name ? <span className="font-normal text-muted-foreground"> · {i.org_name}</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i.used_at
                            ? `Used by ${i.users?.full_name || i.users?.email || "someone"} ${ago(i.used_at)}`
                            : `${i.email ?? "Any email"} · made ${ago(i.created_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge {...state} />
                        {state.label === "open" && !viewing ? (
                          <form action={revokePartnerLinkAction}>
                            <input type="hidden" name="inviteId" value={i.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Revoke
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
