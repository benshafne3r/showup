import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gradient-stage flex min-h-screen flex-col">
      <header className="p-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="text-gradient-brand">{BRAND.name}</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
