import { handler, notFound, type Params } from "@/lib/http";
import { activity } from "@/lib/repo";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { sse } from "@/lib/sse";
import { streamJsonArray } from "@/lib/ai/streamJson";
import { planPrdDraft, prdSchema, prdFieldSchema } from "../route";

/**
 * POST { sectionId, seed? } → SSE
 *   field { id, content }  — 항목 하나가 완성될 때마다(제안 카드가 하나씩 채워진다)
 *   done  { count }
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { sectionId, seed } = (await req.json().catch(() => ({}))) as { sectionId?: string | null; seed?: string };
  const plan = planPrdDraft(id, sectionId, seed);
  if (!plan) return notFound();
  const valid = new Set(plan.targets.map((t) => t.id));
  return sse(async (send) => {
    let count = 0;
    await streamJsonArray({
      task: "prd.draft", system: MANNY_SYSTEM, prompt: plan.prompt, schema: prdSchema, arrayKey: "fields", itemSchema: prdFieldSchema,
      onItem: (f) => { if (valid.has(f.id)) { count++; send("field", f); } },
    });
    activity.log(id, "ai.prd", sectionId ? plan.sections[0]?.title ?? "섹션" : "전체 PRD", { count, streamed: true }, "manny");
    send("done", { count });
  });
});
