import { redirect } from "next/navigation";

// The label dashboard was removed — Tours is the landing surface. This route
// stays as a redirect so existing /label links (and the post-onboarding
// welcome param) still resolve.
export default async function LabelIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  redirect(welcome ? "/label/tours?welcome=1" : "/label/tours");
}
