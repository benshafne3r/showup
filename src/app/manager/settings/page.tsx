import type { Metadata } from "next";
import { requireManagerPage } from "../require-manager";
import { serviceDb } from "@/server/db/service";
import { AgencyForm } from "../onboarding/agency-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function ManagerSettingsPage() {
  const ctx = await requireManagerPage();
  const db = serviceDb();
  const [{ data: agency }, { data: team }] = await Promise.all([
    db.from("agencies").select("name, website, city").eq("id", ctx.agencyId).single(),
    db
      .from("agency_members")
      .select("role, users(full_name, email)")
      .eq("agency_id", ctx.agencyId)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your management company's details." />
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
          <CardTitle className="text-base">Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="space-y-1">
            {(team ?? []).map((m) => (
              <li key={m.users?.email} className="flex justify-between gap-2">
                <span>
                  {m.users?.full_name || m.users?.email}
                  <span className="text-muted-foreground"> · {m.users?.email}</span>
                </span>
                <span className="text-muted-foreground capitalize">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Need another teammate on your account? Contact ShowUp support and we&apos;ll add them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
