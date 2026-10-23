import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/dates";
import { setCompanyStatusAction } from "../actions";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = pageOf(params.page, PAGE_SIZE);
  const { data: companies, count: total } = await serviceDb()
    .from("companies")
    .select("id, name, kind, website, verified_at, suspended_at, created_at, company_members(count), shows(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page.from, page.to);

  return (
    <div className="space-y-6">
      <PageHeader title="Companies" description="Labels, managers, and agencies on the platform." />
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Company</th>
              <th scope="col" className="px-4 py-3 font-medium">Type</th>
              <th scope="col" className="px-4 py-3 font-medium">Members</th>
              <th scope="col" className="px-4 py-3 font-medium">Shows</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Created</th>
              <th scope="col" className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(companies ?? []).map((company) => (
              <tr key={company.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{company.name}</td>
                <td className="px-4 py-3 capitalize">{company.kind}</td>
                <td className="px-4 py-3">{company.company_members?.[0]?.count ?? 0}</td>
                <td className="px-4 py-3">{company.shows?.[0]?.count ?? 0}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={company.suspended_at ? "suspended" : company.verified_at ? "verified" : "unverified"}
                    tone={company.suspended_at ? "danger" : company.verified_at ? "success" : "warning"}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDateTime(company.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {!company.verified_at ? (
                      <form action={setCompanyStatusAction}>
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="action" value="verify" />
                        <Button variant="ghost" size="sm" type="submit">Verify</Button>
                      </form>
                    ) : null}
                    <form action={setCompanyStatusAction}>
                      <input type="hidden" name="companyId" value={company.id} />
                      <input
                        type="hidden"
                        name="action"
                        value={company.suspended_at ? "reinstate" : "suspend"}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="submit"
                        className={company.suspended_at ? "text-emerald-300" : "text-red-300"}
                      >
                        {company.suspended_at ? "Reinstate" : "Suspend"}
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {(companies ?? []).map((company) => (
          <li key={company.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{company.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{company.kind}</p>
              </div>
              <StatusBadge
                label={company.suspended_at ? "suspended" : company.verified_at ? "verified" : "unverified"}
                tone={company.suspended_at ? "danger" : company.verified_at ? "success" : "warning"}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {company.company_members?.[0]?.count ?? 0} members · {company.shows?.[0]?.count ?? 0} shows · created{" "}
              {formatDateTime(company.created_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
              {!company.verified_at ? (
                <form action={setCompanyStatusAction}>
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="action" value="verify" />
                  <Button variant="ghost" size="sm" type="submit">Verify</Button>
                </form>
              ) : null}
              <form action={setCompanyStatusAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <input
                  type="hidden"
                  name="action"
                  value={company.suspended_at ? "reinstate" : "suspend"}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  className={company.suspended_at ? "text-emerald-300" : "text-red-300"}
                >
                  {company.suspended_at ? "Reinstate" : "Suspend"}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <Pager page={page.page} size={PAGE_SIZE} total={total ?? 0} basePath="/admin/companies" params={params} />
    </div>
  );
}
