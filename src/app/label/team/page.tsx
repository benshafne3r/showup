import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { removeMemberAction, changeMemberRoleAction } from "../actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const context = await requireLabelPage();
  const db = serviceDb();
  const canManage = context.memberRole !== "member";

  const [{ data: members }, { data: invites }] = await Promise.all([
    db
      .from("company_members")
      .select("id, role, user_id, created_at, users:user_id(full_name, email)")
      .eq("company_id", context.companyId)
      .order("created_at"),
    db
      .from("company_invites")
      .select("id, email, role, expires_at, accepted_at, created_at")
      .eq("company_id", context.companyId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team & permissions"
        description="Owners and admins can invite teammates and manage roles."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{member.users?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{member.users?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
                    {member.role}
                  </span>
                  {canManage && member.role !== "owner" && member.user_id !== context.user.id ? (
                    <>
                      <form action={changeMemberRoleAction}>
                        <input type="hidden" name="memberUserId" value={member.user_id} />
                        <input
                          type="hidden"
                          name="newRole"
                          value={member.role === "admin" ? "member" : "admin"}
                        />
                        <Button variant="ghost" size="sm" type="submit">
                          Make {member.role === "admin" ? "member" : "admin"}
                        </Button>
                      </form>
                      <form action={removeMemberAction}>
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
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InviteForm />
            {invites?.length ? (
              <div>
                <p className="mb-1 text-sm font-medium">Pending invites</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {invites.map((invite) => (
                    <li key={invite.id}>
                      {invite.email} · {invite.role} · expires {formatDateTime(invite.expires_at)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
