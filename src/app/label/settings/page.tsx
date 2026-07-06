import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InviteForm } from "./invite-form";
import { removeMemberAction, changeMemberRoleAction } from "../actions";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const context = await requireLabelPage();
  const db = serviceDb();
  const canManage = context.memberRole !== "member";

  const [{ data: company }, { data: members }, { data: invites }] = await Promise.all([
    db
      .from("companies")
      .select("name, kind, website, verified_at, created_at")
      .eq("id", context.companyId)
      .single(),
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Your company profile and team." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{company?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium capitalize">{company?.kind}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Website</span>
            <span className="font-medium">{company?.website ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verification</span>
            <span className="font-medium">
              {company?.verified_at ? `Verified ${formatDateTime(company.verified_at)}` : "Pending platform verification"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your role</span>
            <span className="font-medium capitalize">{context.memberRole}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team &amp; permissions</CardTitle>
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

          {canManage ? (
            <div className="mt-4 space-y-4 border-t pt-4">
              <p className="text-sm font-medium">Invite a teammate</p>
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
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Need to change company details or delete the account? Contact platform support — these
        actions are admin-gated in the MVP.
      </p>
    </div>
  );
}
