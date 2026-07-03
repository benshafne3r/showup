import "server-only";

import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProviderI {
  readonly name: "console" | "resend";
  send(message: EmailMessage): Promise<{ ok: boolean; error?: string }>;
}

/** Dev transport: logs the email to the server console. */
class ConsoleEmailProvider implements EmailProviderI {
  readonly name = "console" as const;
  async send(message: EmailMessage) {
    console.info(
      `\n━━━ 📧 EMAIL (console transport) ━━━\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    );
    return { ok: true };
  }
}

class ResendEmailProvider implements EmailProviderI {
  readonly name = "resend" as const;
  private resend = new Resend(serverEnv.resendApiKey);
  async send(message: EmailMessage) {
    try {
      const { error } = await this.resend.emails.send({
        from: serverEnv.emailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "send failed" };
    }
  }
}

let cached: EmailProviderI | null = null;

export function emailProvider(): EmailProviderI {
  if (!cached) {
    cached =
      serverEnv.emailProvider === "resend" && serverEnv.resendApiKey
        ? new ResendEmailProvider()
        : new ConsoleEmailProvider();
  }
  return cached;
}
