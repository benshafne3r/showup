import "server-only";

import { serviceDb } from "@/server/db/service";
import { signedFileUrl } from "./uploads";
import { agenciesForCreators, agencyForCreator } from "./agencies";
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

/** Threads per page in the inbox, and messages loaded per screen of a thread. */
export const THREAD_PAGE = 30;
const MESSAGE_PAGE = 100;

/**
 * One page of the viewer's inbox, newest activity first, with the true total.
 * Filtering, ordering, last-message previews and unread flags come from SQL
 * (thread_summaries), so no message history is loaded to build the list.
 */
export async function listThreadsFor(
  viewer: ThreadViewer,
  opts: { creatorId?: string; limit?: number; offset?: number } = {},
): Promise<{ threads: ThreadSummary[]; total: number }> {
  const db = serviceDb();
  if (viewer.side === "creator" && (await agencyForCreator(viewer.id))) return { threads: [], total: 0 };
  const { data: threads, error } = await db.rpc("thread_summaries", {
    p_viewer: viewer.id,
    p_creator_id: (viewer.side === "creator" ? viewer.id : (opts.creatorId ?? null)) as string,
    p_company_id: (viewer.side === "company" ? viewer.companyId : null) as string,
    p_agency_id: (viewer.side === "manager" ? viewer.agencyId : null) as string,
    p_limit: opts.limit ?? THREAD_PAGE,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw new Error(`load threads: ${error.message}`);
  if (!threads?.length) return { threads: [], total: 0 };
  const total = Number(threads[0].total);

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

  return {
    total,
    threads: threads.map((thread) => {
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
        lastMessagePreview:
          thread.last_kind === null
            ? ""
            : thread.last_kind === "ticket_instructions"
              ? "🎟 Ticket instructions"
              : (thread.last_body ?? "").slice(0, 90) || "Attachment",
        unread: thread.unread,
      };
    }),
  };
}

/**
 * A thread with its latest MESSAGE_PAGE messages (oldest first on screen).
 * `before` (a message timestamp) loads the screen of messages before it;
 * `olderCursor` is set when there are older ones still.
 */
export async function getThreadForViewer(
  threadId: string,
  viewer: ThreadViewer,
  opts: { before?: string } = {},
): Promise<{
  subject: string;
  counterpartName: string;
  creatorId: string;
  managedBy: string | null;
  messages: ViewMessage[];
  olderCursor: string | null;
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

  let query = db
    .from("messages")
    .select("id, sender_id, sender_agency_id, kind, body, attachment_paths, created_at")
    .eq("thread_id", threadId);
  if (opts.before && !Number.isNaN(Date.parse(opts.before))) query = query.lt("created_at", opts.before);
  const { data: newestFirst } = await query.order("created_at", { ascending: false }).limit(MESSAGE_PAGE + 1);
  const hasOlder = (newestFirst?.length ?? 0) > MESSAGE_PAGE;
  const messages = (newestFirst ?? []).slice(0, MESSAGE_PAGE).reverse();

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
    olderCursor: hasOlder && messages.length ? messages[0].created_at : null,
  };
}
