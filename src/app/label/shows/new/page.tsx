import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ImportableShowForm } from "../importable-show-form";
import { Route } from "lucide-react";

export const metadata: Metadata = { title: "New show" };
export const dynamic = "force-dynamic";

export default async function NewShowPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
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
        title="Create a tour first"
        action={
          <Button asChild>
            <Link href="/label/tours">Go to tours</Link>
          </Button>
        }
      />
    );
  }

  // Launched from a tour ("Add a date") → prefill that tour + its artist.
  const fromTour = params.tour ? (tours ?? []).find((t) => t.id === params.tour) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create a show"
      />
      <ImportableShowForm
        artists={artists}
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        baseInitial={{
          contentDeadlineDays: settings.contentDeadlineDefaultDays,
          ...(fromTour ? { tourId: fromTour.id, artistId: fromTour.artist_id } : {}),
        }}
      />
    </div>
  );
}
