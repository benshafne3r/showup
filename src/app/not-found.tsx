import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-extrabold text-gradient-brand">404</p>
      <h1 className="text-xl font-bold">This page doesn't exist</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page may have moved, or you may not have access to it.
      </p>
      <Button asChild>
        <Link href="/">Back to {BRAND.name}</Link>
      </Button>
    </div>
  );
}
