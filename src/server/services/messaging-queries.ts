import "server-only";

import { serviceDb } from "@/server/db/service";
import { signedFileUrl } from "./uploads";
import type { ThreadSummary } from "@/components/messaging/thread-list";
import type { ThreadMessage as ViewMessage } from "@/components/messaging/thread-view";

/**
 * Messaging read models. Built server-side with the service client so we can
 * resolve counterpart display names WITHOUT exposing user emails through RLS.
 * Callers must pass a verified viewer (from guards) — these functions filter
 * by participation themselves as well.
 */

export async function listThreadsFor(viewer: {
  id: string;
  side: "creator" | "company";
  companyId?: string;
}): Promise<ThreadSummary[]> {
  const db = serviceDb();
  let query = db
    .from("message_threads")
    .select("id, subject, creator_id, company_id, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  query =
    viewer.side === "creator"
      ? query.eq("creator_id", viewer.id)
      : query.eq("company_id", viewer.companyId!);
  const { data: threads } = await query;
  if (!threads?.length) return [];

  const threadIds = threads.map((t) => t.id);
  const { data: lastMessages } = await db
    .from("messages")
    .select("thread_id, body, kind, sender_id, read_by, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  const counterpartIds =
    viewer.side === "creator"
      ? [] // company name resolved below
      : Array.from(new Set(threads.map((t) => t.creator_id)));
  const { data: creators } = counterpartIds.length
    ? await db.from("users").select("id, full_name").in("id", counterpartIds)
    : { data: [] as { id: string; full_name: string }[] };
  const creatorNames = new Map((creators ?? []).map((c) => [c.id, c.full_name]));

  const companyIds = Array.from(new Set(threads.map((t) => t.company_id)));
  const { data: companies } = await db.from("companies").select("id, name").in("id", companyIds);
  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));

  return threads.map((thread) => {
    const msgs = (lastMessages ?? []).filter((m) => m.thread_id === thread.id);
    const last = msgs[0];
    const unread = msgs.some(
      (m) => m.sender_id !== viewer.id && !(m.read_by ?? []).includes(viewer.id),
    );
    return {
      id: thread.id,
      subject: thread.subject,
      counterpartName:
        viewer.side === "creator"
          ? (companyNames.get(thread.company_id) ?? "Artist team")
          : (creatorNames.get(thread.creator_id) ?? "Creator"),
      lastMessageAt: thread.last_message_at,
      lastMessagePreview: last
        ? last.kind === "ticket_instructions"
          ? "🎟 Ticket instructions"
          : last.body.slice(0, 90) || "Attachment"
        : "",
      unread,
    };
  });
}

export async function getThreadForViewer(
  threadId: string,
  viewer: { id: string; side: "creator" | "company"; companyId?: string },
): Promise<{
  subject: string;
  counterpartName: string;
  messages: ViewMessage[];
} | null> {
  const db = serviceDb();
  const { data: thread } = await db
    .from("message_threads")
    .select("id, subject, creator_id, company_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;
  const isParticipant =
    viewer.side === "creator"
      ? thread.creator_id === viewer.id
      : thread.company_id === viewer.companyId;
  if (!isParticipant) return null;

  const { data: messages } = await db
    .from("messages")
    .select("id, sender_id, kind, body, attachment_paths, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id).filter(Boolean)));
  const { data: senders } = senderIds.length
    ? await db.from("users").select("id, full_name").in("id", senderIds as string[])
    : { data: [] as { id: string; full_name: string }[] };
  const senderNames = new Map((senders ?? []).map((s) => [s.id, s.full_name]));

  const { data: company } = await db
    .from("companies")
    .select("name")
    .eq("id", thread.company_id)
    .single();
  const { data: creator } = await db
    .from("users")
    .select("full_name")
    .eq("id", thread.creator_id)
    .single();

  const viewMessages: ViewMessage[] = await Promise.all(
    (messages ?? []).map(async (message) => ({
      id: message.id,
      senderName: message.sender_id
        ? (senderNames.get(message.sender_id) ?? "Member")
        : "System",
      mine: message.sender_id === viewer.id,
      kind: message.kind,
      body: message.body,
      attachments: await Promise.all(
        (message.attachment_paths ?? []).map(async (path, index) => ({
          url: await signedFileUrl("attachments", path),
          label: `Attachment ${index + 1}`,
        })),
      ),
      createdAt: message.created_at,
    })),
  );

  return {
    subject: thread.subject,
    counterpartName:
      viewer.side === "creator" ? (company?.name ?? "Artist team") : (creator?.full_name ?? "Creator"),
    messages: viewMessages,
  };
}
