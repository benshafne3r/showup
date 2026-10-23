import Link from "next/link";
import { withPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** "Showing 51–100 of 340" with Previous / Next links that keep the other query params. */
export function Pager({
  page,
  size,
  total,
  basePath,
  params,
  pageKey = "page",
  className,
}: {
  page: number;
  size: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  pageKey?: string;
  className?: string;
}) {
  if (total <= size && page === 1) return null;
  const last = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const link = (p: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link href={`${basePath}${withPage(params, p, pageKey)}`} className="rounded-md border px-3 py-1.5 hover:border-primary/50" scroll={false}>
        {label}
      </Link>
    ) : (
      <span className="rounded-md border px-3 py-1.5 opacity-40" aria-disabled>
        {label}
      </span>
    );
  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <p className="text-muted-foreground tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {link(page - 1, "Previous", page > 1)}
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {last}
        </span>
        {link(page + 1, "Next", page < last)}
      </div>
    </nav>
  );
}
