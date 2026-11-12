import type { Metadata } from "next";
import { requireManagerPage } from "../require-manager";
import { serviceDb } from "@/server/db/service";
import { AgencyForm } from "../onboarding/agency-form";
import { PageHeader } from "@/components/page-header";
import { TeamInviteForm } from "@/components/team-invite-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import {
  changeAgencyMemberRoleAction,
  inviteAgencyMemberAction,
  removeAgencyMemberAction,
  revokeAgencyInviteAction,
} from "../actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function ManagerSettingsPage() {
  const ctx = await requireManagerPage();
  const canManage = ctx.memberRole !== "member";
  const db = serviceDb();
  const [{ data: agency }, { data: team }, { data: invites }] = await Promise.all([
    db.from("agencies").select("name, website, city").eq("id", ctx.agencyId).single(),
    db
      .from("agency_members")
      .select("id, role, user_id, users(full_name, email)")
      .eq("agency_id", ctx.agencyId)
      .order("created_at", { ascending: true }),
    db
      .from("agency_invites")
      .select("id, email, role, expires_at")
      .eq("agency_id", ctx.agencyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company profile</CardTitle>
        </CardHeader>
        <CardContent>
          <AgencyForm
            mode="update"
            submitLabel="Save"
            defaults={{ name: agency?.name, website: agency?.website, city: agency?.city }}
            disabled={ctx.memberRole === "member"}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team &amp; permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(team ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{member.users?.full_name || member.users?.email}</p>
                  <p className="text-xs text-muted-foreground">{member.users?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">{member.role}</span>
                  {canManage && member.role !== "owner" && member.user_id !== ctx.user.id ? (
                    <>
                      <form action={changeAgencyMemberRoleAction}>
                        <input type="hidden" name="memberUserId" value={member.user_id} />
                        <input type="hidden" name="newRole" value={member.role === "admin" ? "member" : "admin"} />
                        <Button variant="ghost" size="sm" type="submit">
                          Make {member.role === "admin" ? "member" : "admin"}
                        </Button>
                      </form>
                      <form action={removeAgencyMemberAction}>
                        <input type="hidden" name="memberUserId" value={member.user_id} />
                        <Button variant="ghost" size="sm" type="submit" className="text-red-300">
                          Remove
                        </Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {canManage ? (
            <div className="mt-4 space-y-4 border-t pt-4">
              <p className="text-sm font-medium">Invite a teammate</p>
              <TeamInviteForm action={inviteAgencyMemberAction} placeholder="teammate@company.com" />
              {invites?.length ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Pending invites</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {invites.map((invite) => (
                      <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {invite.email} · {invite.role} · expires {formatDateTime(invite.expires_at)}
                        </span>
                        <form action={revokeAgencyInviteAction}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <Button variant="ghost" size="sm" type="submit">
                            Cancel
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
