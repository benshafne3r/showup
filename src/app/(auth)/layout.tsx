import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gradient-stage flex min-h-screen flex-col">
      <header className="p-6">
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="p-6 text-center text-xs text-muted-foreground">
        Trouble signing in?{" "}
        <a
          href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`${BRAND.name} sign-in help`)}`}
          className="font-medium text-primary hover:underline"
        >
          Email support
        </a>
      </footer>
    </div>
  );
}
