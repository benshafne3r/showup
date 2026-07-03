import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-creators", label: "For creators" },
  { href: "/for-labels", label: "For labels" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            <span className="text-gradient-brand">{BRAND.name}</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
          </p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
