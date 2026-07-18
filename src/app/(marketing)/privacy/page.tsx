import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {BRAND.legalEffectiveDate}. This policy explains how {BRAND.legalEntity} (&ldquo;
        {BRAND.name}&rdquo;) collects, uses, and shares information when you use our platform.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <Section title="1. Information we collect">
          <p>
            <strong className="text-foreground">Account &amp; profile.</strong> Name, email, password
            (hashed), role, and — for Creators — profile details such as city, content categories,
            bio, social handles, and self-reported audience metrics.
          </p>
          <p>
            <strong className="text-foreground">Activity.</strong> Shows, opportunities, requests,
            bookings, attendance check-ins, uploaded proof files, content submissions, in-app
            messages, notifications, and support requests.
          </p>
          <p>
            <strong className="text-foreground">Payment information.</strong> When you add a card or set
            up payouts, our payment processor (Stripe) collects and verifies your payment and
            identity details directly. We receive limited information such as the card brand, last
            four digits, and payout status — never your full card number.
          </p>
          <p>
            <strong className="text-foreground">Technical.</strong> Basic log and device data needed to
            operate and secure the service.
          </p>
        </Section>

        <Section title="2. How we use information">
          <p>
            To operate the marketplace (match Creators and Organizers, run bookings, place and release
            card holds, process Creator payouts), to verify attendance and content, to communicate
            with you, to prevent fraud and abuse, to resolve disputes, and to comply with legal
            obligations.
          </p>
        </Section>

        <Section title="3. What we share">
          <p>
            <strong className="text-foreground">Between users, minimally.</strong> Personal email
            addresses and phone numbers are private by default. Organizers and Creators communicate
            through in-app messaging and see only display names, cities, social handles, and the
            details relevant to a booking.
          </p>
          <p>
            <strong className="text-foreground">Service providers.</strong> We share what&rsquo;s
            necessary with vendors that run the service on our behalf — including Stripe (payments and
            payouts), our hosting and database providers, and email delivery. They may only use the
            data to provide their service to us.
          </p>
          <p>
            <strong className="text-foreground">Legal &amp; safety.</strong> We may disclose information
            to comply with law, enforce our terms, or protect the rights and safety of users and the
            public. We do not sell your personal information.
          </p>
        </Section>

        <Section title="4. Payment data and Stripe">
          <p>
            Payments are handled by Stripe. Card details are tokenized in your browser and sent
            directly to Stripe; {BRAND.name}{" "}never stores full card numbers. Creators who receive
            payouts complete Stripe-hosted identity and bank verification, and their information is
            processed under Stripe&rsquo;s privacy policy in addition to this one.
          </p>
        </Section>

        <Section title="5. Retention">
          <p>
            We keep information for as long as your account is active and as needed to provide the
            service, meet legal, tax, and accounting requirements, resolve disputes, and enforce our
            agreements. Some records (e.g. transaction and audit logs) are retained longer where
            required.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            We use industry-standard measures — including encrypted connections, access controls, and
            row-level database security — to protect your information. No system is perfectly secure,
            so we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Your choices and rights">
          <p>
            You can view and update your profile in your account settings and request deletion of your
            account. Depending on where you live, you may have rights to access, correct, delete, or
            port your personal information, or to object to certain processing. To make a request,
            contact us at the email below. We will respond as required by applicable law.
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            {BRAND.name}{" "}is not directed to children under 18, and we do not knowingly collect their
            information. If you believe a minor has provided us information, contact us and we will
            delete it.
          </p>
        </Section>

        <Section title="9. Changes">
          <p>
            We may update this policy. Material changes will be reflected by updating the effective
            date above and, where appropriate, notifying you.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions or requests? Contact {BRAND.legalEntity} at{" "}
            <a className="text-primary hover:underline" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>
            .
          </p>
        </Section>

        <p className="border-t pt-6 text-xs">
          This document is a general template and not legal advice. Have counsel review and adapt it
          for your business and jurisdiction before relying on it.
        </p>
      </div>
    </div>
  );
}
