import "server-only";

import { serviceDb } from "@/server/db/service";
import { signedFileUrl } from "./uploads";
import { agenciesForCreators, agencyForCreator, rosterCreatorIds } from "./agencies";
import type { ThreadSummary } from "@/components/messaging/thread-list";
import type { ThreadMessage as ViewMessage } from "@/components/messaging/thread-view";

/**
 * Messaging read models. Built server-side with the service client so we can
 * resolve counterpart display names WITHOUT exposing user emails through RLS.
 * Callers must pass a verified viewer (from guards) — these functions filter
 * by participation themselves as well.
 *
 * Viewers:
 *   creator — their own threads, unless a management company represents them
 *   company — every thread for the label's company
 *   manager — every thread for a creator on the agency's roster
 */
export type ThreadViewer =
  | { id: string; side: "creator" }
  | { id: string; side: "company"; companyId: string }
  | { id: string; side: "manager"; agencyId: string };

export async function listThreadsFor(
  viewer: ThreadViewer,
  opts: { creatorId?: string } = {},
): Promise<ThreadSummary[]> {
  const db = serviceDb();
  let query = db
    .from("message_threads")
    .select("id, subject, creator_id, company_id, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (viewer.side === "creator") {
    if (await agencyForCreator(viewer.id)) return [];
    query = query.eq("creator_id", viewer.id);
  } else if (viewer.side === "company") {
    query = query.eq("company_id", viewer.companyId);
  } else {
    const roster = await rosterCreatorIds(viewer.agencyId);
    const scoped = opts.creatorId ? roster.filter((id) => id === opts.creatorId) : roster;
    if (!scoped.length) return [];
    query = query.in("creator_id", scoped);
  }
  const { data: threads } = await query;
  if (!threads?.length) return [];

  const threadIds = threads.map((t) => t.id);
  const { data: lastMessages } = await db
    .from("messages")
    .select("thread_id, body, kind, sender_id, read_by, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  const creatorIds = Array.from(new Set(threads.map((t) => t.creator_id)));
  const { data: creators } =
    viewer.side === "creator"
      ? { data: [] as { id: string; full_name: string }[] }
      : await db.from("users").select("id, full_name").in("id", creatorIds);
  const creatorNames = new Map((creators ?? []).map((c) => [c.id, c.full_name]));
  const agencies = viewer.side === "company" ? await agenciesForCreators(creatorIds) : new Map();

  const companyIds = Array.from(new Set(threads.map((t) => t.company_id)));
  const { data: companies } = await db.from("companies").select("id, name").in("id", companyIds);
  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));

  return threads.map((thread) => {
    const msgs = (lastMessages ?? []).filter((m) => m.thread_id === thread.id);
    const last = msgs[0];
    const unread = msgs.some(
      (m) => m.sender_id !== viewer.id && !(m.read_by ?? []).includes(viewer.id),
    );
    const creatorName = creatorNames.get(thread.creator_id) ?? "Creator";
    const companyName = companyNames.get(thread.company_id) ?? "Artist team";
    const agency = agencies.get(thread.creator_id);
    return {
      id: thread.id,
      subject: thread.subject,
      counterpartName:
        viewer.side === "creator"
          ? companyName
          : viewer.side === "manager"
            ? `${companyName} · for ${creatorName}`
            : agency
              ? `${creatorName} · via ${agency.name}`
              : creatorName,
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
  viewer: ThreadViewer,
): Promise<{
  subject: string;
  counterpartName: string;
  creatorId: string;
  managedBy: string | null;
  messages: ViewMessage[];
} | null> {
  const db = serviceDb();
  const { data: thread } = await db
    .from("message_threads")
    .select("id, subject, creator_id, company_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;

  const agency = await agencyForCreator(thread.creator_id);
  const isParticipant =
    viewer.side === "creator"
      ? thread.creator_id === viewer.id && !agency
      : viewer.side === "company"
        ? thread.company_id === viewer.companyId
        : agency?.id === viewer.agencyId;
  if (!isParticipant) return null;

  const { data: messages } = await db
    .from("messages")
    .select("id, sender_id, sender_agency_id, kind, body, attachment_paths, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  const senderIds = Array.from(new Set((messages ?? []).map((m) => m.sender_id).filter(Boolean)));
  const { data: senders } = senderIds.length
    ? await db.from("users").select("id, full_name").in("id", senderIds as string[])
    : { data: [] as { id: string; full_name: string }[] };
  const senderNames = new Map((senders ?? []).map((s) => [s.id, s.full_name]));

  const agencyIds = Array.from(
    new Set((messages ?? []).map((m) => m.sender_agency_id).filter(Boolean)),
  ) as string[];
  const { data: senderAgencies } = agencyIds.length
    ? await db.from("agencies").select("id, name").in("id", agencyIds)
    : { data: [] as { id: string; name: string }[] };
  const agencyNames = new Map((senderAgencies ?? []).map((a) => [a.id, a.name]));

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
  const creatorName = creator?.full_name ?? "Creator";
  const companyName = company?.name ?? "Artist team";

  const viewMessages: ViewMessage[] = await Promise.all(
    (messages ?? []).map(async (message) => {
      const name = message.sender_id ? (senderNames.get(message.sender_id) ?? "Member") : "System";
      const onBehalfOf = message.sender_agency_id ? agencyNames.get(message.sender_agency_id) : null;
      return {
        id: message.id,
        senderName: onBehalfOf ? `${name} · ${onBehalfOf}` : name,
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
      };
    }),
  );

  return {
    subject: thread.subject,
    counterpartName:
      viewer.side === "creator"
        ? companyName
        : viewer.side === "manager"
          ? `${companyName} · for ${creatorName}`
          : agency
            ? `${creatorName} · via ${agency.name}`
            : creatorName,
    creatorId: thread.creator_id,
    managedBy: agency?.name ?? null,
    messages: viewMessages,
  };
}
