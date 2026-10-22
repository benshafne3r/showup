"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  badge,
  exact,
  also,
  variant,
}: {
  href: string;
  label: string;
  badge?: number;
  exact?: boolean;
  also?: string[];
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const active = exact ? pathname === href : under(href) || (also ?? []).some(under);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/12 font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "mobile" && "py-2.5",
      )}
    >
      {label}
      {badge && badge > 0 ? (
        <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
