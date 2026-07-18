import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of Service" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Effective {BRAND.legalEffectiveDate}. These terms are a binding agreement between you and{" "}
        {BRAND.legalEntity} (&ldquo;{BRAND.name},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). Please
        read them carefully.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <Section title="1. What ShowUp is">
          <p>
            {BRAND.name}{" "}is an online marketplace that connects music labels, artist teams, and event
            organizers (&ldquo;Organizers&rdquo;) with social-media creators (&ldquo;Creators&rdquo;).
            Organizers offer complimentary tickets to live events in exchange for a Creator&rsquo;s
            attendance and, optionally, agreed social content. {BRAND.name}{" "}provides the platform; we
            are not the promoter, producer, or seller of any event and are not a party to the
            attendance arrangement between an Organizer and a Creator, except as expressly stated
            here.
          </p>
        </Section>

        <Section title="2. Eligibility and accounts">
          <p>
            You must be at least 18 years old and able to form a binding contract. You agree to
            provide accurate information, keep your credentials secure, and are responsible for
            activity under your account. Organizer accounts may have multiple team members; the
            company is responsible for its members&rsquo; actions. We may suspend or terminate
            accounts that violate these terms.
          </p>
        </Section>

        <Section title="3. Tickets are complimentary">
          <p>
            Tickets offered through {BRAND.name}{" "}are provided at no charge by the Organizer as part of
            a promotional collaboration. They are not resold and have no cash value. Availability,
            venue, seating, and entry are controlled by the Organizer and venue. A confirmed booking
            is a spot on a guest list or a comparable arrangement, not a purchased ticket, and may be
            subject to venue rules, age restrictions, and capacity.
          </p>
        </Section>

        <Section title="4. Attendance deposit (temporary card hold)">
          <p>
            To confirm a booking, a Creator authorizes a <strong className="text-foreground">refundable
            hold</strong> (a temporary authorization, not a charge) on their payment method. The hold
            equals the stated ticket value × the number of tickets requested × the deposit percentage
            set by the Organizer, and applies to every requested ticket, including any guest (+1)
            ticket.
          </p>
          <p>
            <strong className="text-foreground">If you attend</strong> and attendance is verified, the
            hold is released in full and you are never charged. <strong className="text-foreground">If
            you fail to attend</strong> without an approved excuse (a &ldquo;no-show&rdquo;), the hold
            may be captured as a deposit, in whole or in part, to compensate for the reserved spot.
            The deposit is a no-show penalty and commitment device — it is not a purchase and not
            compensation to you.
          </p>
          <p>
            Card authorizations expire after a limited period set by card networks; we place holds
            within that window relative to the event date. You authorize {BRAND.name}{" "}and our payment
            processor to place, release, and capture these holds as described.
          </p>
        </Section>

        <Section title="5. Creator content and payments">
          <p>
            Some opportunities ask a Creator to publish specific social content by a deadline.
            Organizers may offer a fixed <strong className="text-foreground">Creator payment</strong>{" "}
            for content that is delivered and approved. Only an approved Creator payment constitutes
            earnings; the attendance hold is never compensation. Payments are made to Creators via our
            payment processor after the Creator completes payout onboarding and identity/bank
            verification. You are responsible for any taxes on amounts you receive.
          </p>
          <p>
            You retain ownership of content you create. By submitting content or a link to content
            for an opportunity, you grant the Organizer and {BRAND.name}{" "}a non-exclusive, worldwide,
            royalty-free license to view, reference, and (where the opportunity states) reshare that
            content in connection with the event and its promotion. You are responsible for complying
            with each platform&rsquo;s rules, including any required disclosure of a paid or gifted
            partnership.
          </p>
        </Section>

        <Section title="6. Payments processing">
          <p>
            Card holds, captures, and Creator payouts are processed by Stripe. By using {BRAND.name}{" "}
            you also agree to Stripe&rsquo;s applicable terms, and Creators receiving payouts agree to
            the Stripe Connected Account Agreement. We do not store full card numbers; payment details
            are tokenized by Stripe.
          </p>
        </Section>

        <Section title="7. Conduct">
          <p>
            You agree not to: misrepresent your identity, audience, or attendance; transfer or sell a
            complimentary ticket; share private contact details to move a deal off-platform to evade
            these terms; harass other users; scrape or misuse the platform; or use {BRAND.name}{" "}for
            anything unlawful. Contact information is kept private and communication should stay in
            in-app messaging.
          </p>
        </Section>

        <Section title="8. Disputes between users">
          <p>
            Either party may open a dispute on a booking (for example, over attendance or content).
            Related money movement pauses while a {BRAND.name}{" "}administrator reviews the evidence and
            reaches a resolution. Our resolution of a platform dispute is final as to how holds and
            payments on that booking are handled, but does not resolve any independent legal claims
            between the parties.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            {BRAND.name}{" "}is provided &ldquo;as is.&rdquo; We do not guarantee event availability,
            quality, entry, or that any Creator or Organizer will perform. To the fullest extent
            permitted by law, we disclaim implied warranties and are not liable for events, venues,
            or the conduct of Organizers, Creators, or venues.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the fullest extent permitted by law, {BRAND.name}{" "}and its affiliates will not be liable
            for indirect, incidental, special, or consequential damages, and our total liability for
            any claim relating to the service will not exceed the greater of the amounts you paid or
            received through {BRAND.name}{" "}in the three months before the claim, or USD $100.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may stop using {BRAND.name}{" "}at any time. We may suspend or terminate access for
            violations of these terms or to protect the platform or its users. Provisions that by
            their nature should survive (including payment obligations, disclaimers, and limitations
            of liability) survive termination.
          </p>
        </Section>

        <Section title="12. Changes">
          <p>
            We may update these terms. Material changes will be reflected by updating the effective
            date above and, where appropriate, notifying you. Continued use after changes take effect
            constitutes acceptance.
          </p>
        </Section>

        <Section title="13. Governing law">
          <p>
            These terms are governed by the laws of {BRAND.governingLaw}, without regard to conflict
            of laws rules. Disputes will be resolved in the courts located there, unless applicable
            law requires otherwise.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these terms? Contact {BRAND.legalEntity} at{" "}
            <a className="text-primary hover:underline" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>
            .
          </p>
        </Section>

        <p className="border-t pt-6 text-xs">
          This document is a general template and not legal advice. Have counsel review and adapt it
          for your business before relying on it.
        </p>
      </div>
    </div>
  );
}
