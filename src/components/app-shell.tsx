import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bell, Menu } from "lucide-react";
import { NavLink } from "@/components/nav-link";
import { Logo } from "@/components/logo";
import { SupportDialog } from "@/components/support-dialog";

export type NavItem = {
  href: string;
  label: string;
  badge?: number;
  exact?: boolean;
};

/**
 * Shared authenticated shell: top bar + desktop sidebar + mobile sheet nav.
 * Used by the creator, label, and admin apps with different nav items.
 */
export function AppShell({
  navItems,
  homeHref,
  roleLabel,
  userName,
  notificationsHref,
  unreadNotifications,
  viewingAs,
  children,
}: {
  navItems: NavItem[];
  homeHref: string;
  roleLabel: string;
  userName: string;
  notificationsHref: string;
  unreadNotifications: number;
  /** Shown while the platform owner is viewing the app as this user. */
  viewingAs?: { name: string; role: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {viewingAs ? (
        <div
          role="status"
          className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950"
        >
          <span>
            Viewing as {viewingAs.name} ({viewingAs.role}). Read-only: nothing you click changes their account.
          </span>
          <a href="/owner/stop-viewing" className="rounded-md bg-amber-950 px-2.5 py-0.5 text-amber-50 underline-offset-2 hover:underline">
            Stop viewing
          </a>
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <Logo />
                  <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col gap-1 p-3">
                {navItems.map((item) => (
                  <NavLink key={item.href} {...item} variant="mobile" />
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href={homeHref} className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
            <Logo />
            <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
              {roleLabel}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <SupportDialog />
            <Button asChild variant="ghost" size="icon" className="relative" aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ""}`}>
              <Link href={notificationsHref}>
                <Bell className="size-5" aria-hidden />
                {unreadNotifications > 0 ? (
                  <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                ) : null}
              </Link>
            </Button>
            <span className="hidden max-w-36 truncate text-sm text-muted-foreground sm:block">
              {userName}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav aria-label="Main" className="sticky top-20 flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} variant="desktop" />
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
