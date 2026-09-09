import { handler, bad, notFound, type Params } from "@/lib/http";
import { meetings } from "@/lib/repo";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { sse } from "@/lib/sse";
import { streamJsonArray } from "@/lib/ai/streamJson";
import { planExtract, decisionsSchema, decisionSchema } from "../route";

/**
 * POST → SSE
 *   decision { decision }  — 결정 하나가 완성될 때마다 저장하고 밀어준다
 *   done     { count, decisions }
 */
export const POST = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const plan = planExtract(meetingId);
  if ("error" in plan) return plan.status === 404 ? notFound() : bad(plan.error);
  return sse(async (send) => {
    const r = await streamJsonArray({
      task: "meeting.extract", system: MANNY_SYSTEM, prompt: plan.prompt, schema: decisionsSchema, arrayKey: "decisions", itemSchema: decisionSchema,
      onItem: (d) => { const row = meetings.addDecision({ meetingId, projectId: plan.m.projectId, text: d.text, rationale: d.rationale, status: d.status }); send("decision", { decision: row }); },
    });
    send("done", { count: r.count, decisions: meetings.decisions(meetingId) });
  });
});
