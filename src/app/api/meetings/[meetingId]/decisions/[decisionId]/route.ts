import { handler, ok, notFound, type Params } from "@/lib/http";
import { meetings } from "@/lib/repo";
import type { Decision } from "@/lib/types";

export const PATCH = handler(async (req, { params }: Params<"meetingId" | "decisionId">) => {
  const { meetingId, decisionId } = await params;
  const d = meetings.decisions(meetingId).find((x) => x.id === decisionId);
  if (!d) return notFound();
  const patch = (await req.json()) as Partial<Pick<Decision, "text" | "rationale" | "status" | "applied">>;
  return ok(meetings.updateDecision(decisionId, patch));
});

export const DELETE = handler(async (_req, { params }: Params<"meetingId" | "decisionId">) => {
  const { meetingId, decisionId } = await params;
  const d = meetings.decisions(meetingId).find((x) => x.id === decisionId);
  if (!d) return notFound();
  meetings.removeDecision(decisionId);
  return ok({ ok: true });
});
