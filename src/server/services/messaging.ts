import "server-only";

import { serviceDb } from "@/server/db/service";
import { notify, notifyCompany } from "./notifications";
import { enforceRateLimit } from "./rate-limit";
import { uploadFile } from "./uploads";

/**
 * One thread per request/booking between the creator and the company team.
 * Personal contact details are never exposed — display names only.
 */

async function assertParticipant(threadId: string, userId: string) {
  const db = serviceDb();
  const { data: thread } = await db
    .from("message_threads")
    .select("id, creator_id, company_id")
    .eq("id", threadId)
    .single();
  if (!thread) throw new Error("Thread not found");
  if (thread.creator_id === userId) return { thread, side: "creator" as const };

  const { data: membership } = await db
    .from("company_members")
    .select("id")
    .eq("company_id", thread.company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership) return { thread, side: "company" as const };

  const { data: user } = await db.from("users").select("role").eq("id", userId).single();
  if (user?.role === "admin") return { thread, side: "company" as const };
  throw new Error("Not a participant in this thread");
}

export async function sendMessage(input: {
  senderId: string;
  threadId: string;
  body: string;
  attachments?: File[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await enforceRateLimit("message.send", input.senderId);
  let participant;
  try {
    participant = await assertParticipant(input.threadId, input.senderId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { thread, side } = participant;

  if (!input.body.trim() && !(input.attachments?.length)) {
    return { ok: false, error: "Message is empty" };
  }

  const attachmentPaths: string[] = [];
  for (const file of (input.attachments ?? []).slice(0, 3)) {
    attachmentPaths.push(await uploadFile("attachments", input.senderId, file));
  }

  const db = serviceDb();
  const { error } = await db.from("messages").insert({
    thread_id: thread.id,
    sender_id: input.senderId,
    kind: attachmentPaths.length > 0 ? "attachment" : "text",
    body: input.body.trim(),
    attachment_paths: attachmentPaths,
    read_by: [input.senderId],
  });
  if (error) return { ok: false, error: error.message };

  await db
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", thread.id);

  const preview = input.body.trim().slice(0, 80) || "Sent an attachment";
  if (side === "creator") {
    await notifyCompany(thread.company_id, {
      type: "new_message",
      title: "New message from a creator",
      body: preview,
      link: `/label/messages/${thread.id}`,
    });
  } else {
    await notify({
      userId: thread.creator_id,
      type: "new_message",
      title: "New message from the artist team",
      body: preview,
      link: `/creator/messages/${thread.id}`,
    });
  }
  return { ok: true };
}

export async function markThreadRead(userId: string, threadId: string): Promise<void> {
  try {
    await assertParticipant(threadId, userId);
  } catch {
    return;
  }
  await serviceDb().rpc("mark_thread_read", { p_thread_id: threadId, p_user_id: userId });
}

/** Unread message count across all threads the user participates in. */
export async function unreadMessageCount(userId: string): Promise<number> {
  const db = serviceDb();
  const { data: memberships } = await db
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId);
  const companyIds = (memberships ?? []).map((m) => m.company_id);

  let threadQuery = db.from("message_threads").select("id");
  threadQuery = companyIds.length
    ? threadQuery.or(`creator_id.eq.${userId},company_id.in.(${companyIds.join(",")})`)
    : threadQuery.eq("creator_id", userId);
  const { data: threads } = await threadQuery;
  if (!threads?.length) return 0;

  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threads.map((t) => t.id))
    .neq("sender_id", userId)
    .not("read_by", "cs", `{${userId}}`);
  return count ?? 0;
}
