import { handler, ok, notFound, type Params } from "@/lib/http";
import { meetings } from "@/lib/repo";
import type { Decision } from "@/lib/types";

/** GET → decisions list. POST { text?, rationale?, status? } → add decision manually */
export const GET = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  if (!meetings.get(meetingId)) return notFound();
  return ok(meetings.decisions(meetingId));
});

export const POST = handler(async (req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const m = meetings.get(meetingId);
  if (!m) return notFound();
  const body = (await req.json().catch(() => ({}))) as { text?: string; rationale?: string; status?: Decision["status"] };
  return ok(meetings.addDecision({ meetingId, projectId: m.projectId, text: body.text?.trim() || "새 결정", rationale: body.rationale, status: body.status }), { status: 201 });
});
