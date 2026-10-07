"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { sendSupportMessage, SUPPORT_TOPICS } from "@/server/services/support";
import { toActionError } from "@/server/action-error";

export type SupportState = { error: string } | { sent: string } | null;

const schema = z.object({
  topic: z.enum(Object.keys(SUPPORT_TOPICS) as [keyof typeof SUPPORT_TOPICS, ...(keyof typeof SUPPORT_TOPICS)[]]),
  message: z.string().trim().min(5, "Tell us a little about what's happening").max(4000),
  page: z.string().max(500).optional().default("/"),
});

/** The Help button in the app header. */
export async function sendSupportMessageAction(_prev: SupportState, formData: FormData): Promise<SupportState> {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await sendSupportMessage({
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      topic: parsed.data.topic,
      message: parsed.data.message,
      page: parsed.data.page,
    });
    if (!result.ok) return { error: result.error };
    return { sent: user.email };
  } catch (err) {
    return toActionError(err, "support.message");
  }
}
