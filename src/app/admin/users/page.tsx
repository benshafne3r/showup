import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/dates";
import { setUserStatusAction, verifyUserAction } from "../actions";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  const { data: users } = await serviceDb()
    .from("users")
    .select("id, email, full_name, role, status, verified_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Verify or suspend creator and label accounts." />
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Email</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Joined</th>
              <th scope="col" className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  {user.full_name}
                  {user.verified_at ? (
                    <span className="ml-1 text-xs text-sky-300" title="Verified">✓</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3 capitalize">{user.role}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={user.status}
                    tone={user.status === "active" ? "success" : "danger"}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDateTime(user.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {!user.verified_at ? (
                      <form action={verifyUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <Button variant="ghost" size="sm" type="submit">
                          Verify
                        </Button>
                      </form>
                    ) : null}
                    {user.role !== "admin" ? (
                      <form action={setUserStatusAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={user.status === "active" ? "suspended" : "active"}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          type="submit"
                          className={user.status === "active" ? "text-red-300" : "text-emerald-300"}
                        >
                          {user.status === "active" ? "Suspend" : "Reinstate"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {(users ?? []).map((user) => (
          <li key={user.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {user.full_name}
                  {user.verified_at ? (
                    <span className="ml-1 text-xs text-sky-300" title="Verified">✓</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <StatusBadge
                label={user.status}
                tone={user.status === "active" ? "success" : "danger"}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="capitalize">{user.role}</span> · joined {formatDateTime(user.created_at)}
            </p>
            {!user.verified_at || user.role !== "admin" ? (
              <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
                {!user.verified_at ? (
                  <form action={verifyUserAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      Verify
                    </Button>
                  </form>
                ) : null}
                {user.role !== "admin" ? (
                  <form action={setUserStatusAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={user.status === "active" ? "suspended" : "active"}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      type="submit"
                      className={user.status === "active" ? "text-red-300" : "text-emerald-300"}
                    >
                      {user.status === "active" ? "Suspend" : "Reinstate"}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
