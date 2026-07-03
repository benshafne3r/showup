import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Company settings" };
export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const context = await requireLabelPage();
  const { data: company } = await serviceDb()
    .from("companies")
    .select("name, kind, website, verified_at, created_at")
    .eq("id", context.companyId)
    .single();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Company settings" />
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
      <p className="text-xs text-muted-foreground">
        Need to change company details or delete the account? Contact platform support — these
        actions are admin-gated in the MVP.
      </p>
    </div>
  );
}
