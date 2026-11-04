import type { Metadata } from "next";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { BulkImportForm } from "../bulk-import-form";

export const metadata: Metadata = { title: "Import tour dates" };
export const dynamic = "force-dynamic";

export default async function ImportShowsPage() {
  const context = await requireLabelPage();
  const db = serviceDb();
  const [{ data: tours }, settings] = await Promise.all([
    db.from("tours").select("id, name, artist_id").eq("company_id", context.companyId).order("name"),
    getPlatformSettings(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Import tour dates"
      />
      <BulkImportForm
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        contentDeadlineDefaultDays={settings.contentDeadlineDefaultDays}
      />
    </div>
  );
}
