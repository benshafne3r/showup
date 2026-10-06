import "server-only";

import { serviceDb } from "@/server/db/service";
import { deliver, notifyCompany } from "./notifications";
import { agencyForCreator, notifyAgency } from "./agencies";
import { enforceRateLimit } from "./rate-limit";
import { uploadFile } from "./uploads";

/**
 * One thread per request/booking between the creator and the company team.
 * Personal contact details are never exposed — display names only.
 *
 * When the creator is represented by a management company, the thread is the
 * agency's: its team reads and replies on the creator's behalf, and the
 * creator themself is not a participant.
 */

type Participant =
  | { side: "creator" | "company" }
  | { side: "manager"; agencyId: string; agencyName: string };

async function assertParticipant(threadId: string, userId: string) {
  const db = serviceDb();
  const { data: thread } = await db
    .from("message_threads")
    .select("id, subject, creator_id, company_id")
    .eq("id", threadId)
    .single();
  if (!thread) throw new Error("Thread not found");

  const agency = await agencyForCreator(thread.creator_id);
  if (thread.creator_id === userId) {
    if (agency) throw new Error(`${agency.name} handles your conversations with artist teams`);
    return { thread, agency, participant: { side: "creator" } as Participant };
  }
  if (agency) {
    const { data: manager } = await db
      .from("agency_members")
      .select("id")
      .eq("agency_id", agency.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (manager) {
      return {
        thread,
        agency,
        participant: { side: "manager", agencyId: agency.id, agencyName: agency.name } as Participant,
      };
    }
  }

  const { data: membership } = await db
    .from("company_members")
    .select("id")
    .eq("company_id", thread.company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership) return { thread, agency, participant: { side: "company" } as Participant };

  const { data: user } = await db.from("users").select("role").eq("id", userId).single();
  if (user?.role === "admin") return { thread, agency, participant: { side: "company" } as Participant };
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
  const { thread, agency } = participant;
  const sender = participant.participant;

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
    sender_agency_id: sender.side === "manager" ? sender.agencyId : null,
  });
  if (error) return { ok: false, error: error.message };

  await db
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", thread.id);

  const preview = input.body.trim().slice(0, 80) || "Sent an attachment";
  if (sender.side === "creator") {
    await notifyCompany(thread.company_id, {
      type: "new_message",
      title: "New message from a creator",
      body: preview,
      link: `/label/messages/${thread.id}`,
    });
  } else if (sender.side === "manager") {
    await notifyCompany(thread.company_id, {
      type: "new_message",
      title: `New message from ${sender.agencyName}`,
      body: preview,
      link: `/label/messages/${thread.id}`,
    });
  } else if (agency) {
    // Label → managed creator: the agency team gets it, not the creator.
    await notifyAgency(agency.id, {
      type: "new_message",
      title: `New message about ${thread.subject}`,
      body: preview,
      link: `/manager/messages/${thread.id}`,
    });
  } else {
    await deliver({
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
  const [{ data: memberships }, { data: agencyMembership }, managedBy] = await Promise.all([
    db.from("company_members").select("company_id").eq("user_id", userId),
    db.from("agency_members").select("agency_id").eq("user_id", userId).maybeSingle(),
    agencyForCreator(userId),
  ]);
  const companyIds = (memberships ?? []).map((m) => m.company_id);
  // A managed creator's threads belong to their agency; a manager's are the roster's.
  const creatorIds = managedBy ? [] : [userId];
  if (agencyMembership) {
    const { data: roster } = await db
      .from("agency_creators")
      .select("creator_id")
      .eq("agency_id", agencyMembership.agency_id);
    creatorIds.push(...(roster ?? []).map((r) => r.creator_id));
  }

  const filters = [
    creatorIds.length ? `creator_id.in.(${creatorIds.join(",")})` : null,
    companyIds.length ? `company_id.in.(${companyIds.join(",")})` : null,
  ].filter(Boolean);
  if (!filters.length) return 0;
  const { data: threads } = await db.from("message_threads").select("id").or(filters.join(","));
  if (!threads?.length) return 0;

  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threads.map((t) => t.id))
    .neq("sender_id", userId)
    .not("read_by", "cs", `{${userId}}`);
  return count ?? 0;
}
