/** Team change the platform owner makes while viewing as someone (see /api/owner/team). */
export type OwnerTeamRequest =
  | { op: "invite"; kind: "label" | "manager"; orgId: string; email: string; role: "admin" | "member" }
  | { op: "role"; kind: "label" | "manager"; orgId: string; memberUserId: string; role: "admin" | "member" }
  | { op: "remove"; kind: "label" | "manager"; orgId: string; memberUserId: string }
  | { op: "revoke"; kind: "manager"; orgId: string; inviteId: string };

export async function sendOwnerTeamRequest(request: OwnerTeamRequest): Promise<{ error: string } | { success: string }> {
  try {
    const response = await fetch("/api/owner/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) return { error: data.error ?? "That didn't work. Try again." };
    return { success: data.message ?? "Done" };
  } catch {
    return { error: "That didn't work. Try again." };
  }
}
