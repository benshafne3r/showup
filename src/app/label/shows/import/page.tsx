import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BulkImportForm } from "../bulk-import-form";
import { Route } from "lucide-react";

export const metadata: Metadata = { title: "Import tour dates" };
export const dynamic = "force-dynamic";

export default async function ImportShowsPage() {
  const context = await requireLabelPage();
  const db = serviceDb();
  const [{ data: artists }, { data: tours }, settings] = await Promise.all([
    db.from("artists").select("id, name").eq("company_id", context.companyId).order("name"),
    db.from("tours").select("id, name, artist_id").eq("company_id", context.companyId).order("name"),
    getPlatformSettings(),
  ]);

  if (!artists?.length) {
    return (
      <EmptyState
        icon={Route}
        title="Add an artist first"
        description="Bulk import pulls an artist's announced tour dates. Create a tour (you can add the artist there) to get started."
        action={
          <Button asChild>
            <Link href="/label/tours">Go to tours</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Import tour dates"
        description="Pull an artist's dates, pick the ones you want, and publish a show for each with the same terms."
      />
      <BulkImportForm
        artists={artists}
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        depositTemplates={settings.depositPercentageTemplates}
        contentDeadlineDefaultDays={settings.contentDeadlineDefaultDays}
      />
    </div>
  );
}
