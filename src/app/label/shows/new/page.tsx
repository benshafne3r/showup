import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ImportableShowForm } from "../importable-show-form";
import { Music2 } from "lucide-react";

export const metadata: Metadata = { title: "New show" };
export const dynamic = "force-dynamic";

export default async function NewShowPage() {
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
        icon={Music2}
        title="Add an artist first"
        description="Shows belong to artists — create your first artist, then come back."
        action={
          <Button asChild>
            <Link href="/label/artists">Go to artists</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create a show"
        description="Import a tour date to prefill the details, or fill it in by hand. Publishing makes the opportunity visible to creators immediately."
      />
      <ImportableShowForm
        artists={artists}
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        depositTemplates={settings.depositPercentageTemplates}
        baseInitial={{ contentDeadlineDays: settings.contentDeadlineDefaultDays }}
      />
    </div>
  );
}
