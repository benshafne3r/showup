import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = serviceDb();

  let query = db
    .from("audit_logs")
    .select("id, actor_role, action, entity_type, entity_id, metadata, created_at, users:actor_id(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (params.action) query = query.ilike("action", `%${params.action}%`);
  if (params.entity) query = query.eq("entity_type", params.entity);
  const { data: logs } = await query;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit logs"
        description="Append-only ledger of every sensitive action."
      />
      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="text"
          name="action"
          defaultValue={params.action ?? ""}
          placeholder="Filter by action (e.g. authorization)"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          aria-label="Filter by action"
        />
        <input
          type="text"
          name="entity"
          defaultValue={params.entity ?? ""}
          placeholder="Entity type (e.g. booking)"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          aria-label="Filter by entity type"
        />
        <button type="submit" className="h-9 rounded-md border px-4 text-sm hover:bg-muted">
          Filter
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Actor</th>
              <th scope="col" className="px-4 py-3 font-medium">Action</th>
              <th scope="col" className="px-4 py-3 font-medium">Entity</th>
              <th scope="col" className="px-4 py-3 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="border-b align-top last:border-0">
                <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-4 py-2.5">
                  {log.users?.full_name ?? "System"}
                  <span className="block text-xs text-muted-foreground">{log.actor_role}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {log.entity_type}
                  {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}
                </td>
                <td className="max-w-72 px-4 py-2.5">
                  <code className="block truncate text-xs text-muted-foreground">
                    {JSON.stringify(log.metadata)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
