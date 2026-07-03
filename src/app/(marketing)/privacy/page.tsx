import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Placeholder — not legal advice.</p>
      <div className="mt-8 space-y-4 text-sm text-muted-foreground">
        <p>
          This placeholder policy must be replaced by a counsel-reviewed policy before public
          launch.
        </p>
        <p>
          <strong className="text-foreground">What we collect.</strong> Account details, creator
          profile information (city, social handles, audience metrics), show and booking
          activity, messages, and uploaded proof files.
        </p>
        <p>
          <strong className="text-foreground">Payment data.</strong> Card details are tokenized by our
          payment provider; {BRAND.name} never stores full card numbers.
        </p>
        <p>
          <strong className="text-foreground">What we share.</strong> Personal email addresses and phone
          numbers are kept private by default — artist teams and creators communicate through
          in-app messaging and see display names, cities, and social handles only.
        </p>
      </div>
    </div>
  );
}
