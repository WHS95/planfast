import { handler, bad, notFound, type Params } from "@/lib/http";
import { activity } from "@/lib/repo";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { sse } from "@/lib/sse";
import { streamJsonObject } from "@/lib/ai/streamJson";
import { SPEC_SLOTS } from "@/lib/types";
import { planSlots, slotsOutSchema } from "../route";

/**
 * POST { itemId, hint? } → SSE
 *   slot { key, value }  — 슬롯 하나가 완성될 때마다(9개가 위에서부터 차례로 채워진다)
 *   done { count }
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { itemId, hint = "" } = (await req.json().catch(() => ({}))) as { itemId?: string; hint?: string };
  const plan = planSlots(id, itemId, hint);
  if ("error" in plan) return plan.status === 404 ? notFound(plan.error) : bad(plan.error);
  const keys = new Set<string>(SPEC_SLOTS);
  return sse(async (send) => {
    const r = await streamJsonObject({
      task: "features.slots", system: MANNY_SYSTEM, prompt: plan.prompt, schema: slotsOutSchema, objectKey: "slots",
      onEntry: (key, value) => { if (keys.has(key) && typeof value === "string") send("slot", { key, value }); },
    });
    activity.log(id, "ai.slots", plan.spec.title, { itemId, streamed: true }, "manny");
    send("done", { count: r.count });
  });
});
