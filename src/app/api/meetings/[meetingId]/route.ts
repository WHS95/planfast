import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { meetings, projects } from "@/lib/repo";

export const GET = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const m = meetings.get(meetingId);
  if (!m) return notFound();
  return ok({ meeting: m, decisions: meetings.decisions(meetingId) });
});

export const PATCH = handler(async (req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const m = meetings.get(meetingId);
  if (!m) return notFound();
  const patch = (await req.json()) as { title?: string; content?: string; heldAt?: string; projectId?: string | null };
  if (patch.projectId && !projects.get(patch.projectId)) return bad("project not found");
  const next = meetings.update(meetingId, patch);
  return ok(next);
});

export const DELETE = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  if (!meetings.get(meetingId)) return notFound();
  meetings.remove(meetingId);
  return ok({ ok: true });
});
