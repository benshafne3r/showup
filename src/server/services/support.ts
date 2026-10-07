import "server-only";

import { emailProvider } from "@/server/providers/email";
import { notificationEmailHtml } from "@/server/providers/email/template";
import { enforceRateLimit } from "./rate-limit";
import { log } from "@/server/log";
import { BRAND } from "@/lib/brand";
import { publicEnv } from "@/lib/env";

export const SUPPORT_TOPICS = {
  broken: "Something isn't working",
  payment: "Card, hold or payment",
  account: "Account or sign-in",
  other: "Something else",
} as const;
export type SupportTopic = keyof typeof SUPPORT_TOPICS;

/**
 * "Help" button → an email to the platform owner, with who sent it and from
 * where, and Reply-To set to the user so a reply goes straight back to them.
 */
export async function sendSupportMessage(input: {
  user: { id: string; email: string; fullName: string; role: string };
  topic: SupportTopic;
  message: string;
  page: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await enforceRateLimit("support.message", input.user.id);
  const topic = SUPPORT_TOPICS[input.topic];
  const who = input.user.fullName || input.user.email;
  const pageUrl = `${publicEnv.appUrl}${input.page.startsWith("/") ? input.page : "/"}`;
  const result = await emailProvider().send({
    to: BRAND.supportEmail,
    replyTo: input.user.email,
    subject: `${BRAND.name} support: ${topic} (${who})`,
    text: [
      `${who} <${input.user.email}> (${input.user.role}) wrote:`,
      "",
      input.message,
      "",
      `Topic: ${topic}`,
      `Page: ${pageUrl}`,
      `User id: ${input.user.id}`,
      "",
      "Reply to this email to answer them directly.",
    ].join("\n"),
    html: notificationEmailHtml({
      name: "Ben",
      title: `${BRAND.name} support: ${topic}`,
      body: `${who} needs help: ${topic.toLowerCase()}.`,
      href: null,
      extras: {
        details: [
          { label: "From", value: `${who} (${input.user.role})` },
          { label: "Email", value: input.user.email },
          { label: "Page", value: pageUrl },
        ],
        quote: { from: who, text: input.message },
      },
    }),
  });
  if (!result.ok) {
    log.error("Support message failed to send", { userId: input.user.id, error: result.error });
    return { ok: false, error: `We couldn't send that. Please email ${BRAND.supportEmail} directly.` };
  }
  return { ok: true };
}
