import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";

/** Invite links (`/join/<token>`): private partner landing pages + roster/team invites. */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gradient-stage flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-6">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-block">
          <Logo />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} {BRAND.legalEntity} · Questions? {BRAND.supportEmail}
      </footer>
    </div>
  );
}
