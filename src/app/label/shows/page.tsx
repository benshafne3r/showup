import { redirect } from "next/navigation";

/** Shows and Tours are one tab now: the tour view at /label/tours. */
export default async function ShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string }>;
}) {
  const { imported } = await searchParams;
  redirect(imported ? `/label/tours?imported=${encodeURIComponent(imported)}` : "/label/tours");
}
