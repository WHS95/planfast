import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, activity } from "@/lib/repo";
import { flowReadiness } from "@/lib/flow/readiness";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { flowSchema, planFlowGen, normalizeFlow } from "@/lib/ai/flowGen";

/** GET → { ready, hasPrd, hasFeature } */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  return ok(flowReadiness(p));
});

/**
 * POST { mode: "new" | "revise", request?, flowId?, name? } → Flow (created & stored)
 * 한 번에 결과를 돌려주는 경로(MCP·스크립트용). 화면은 `./stream` 을 써서 노드가 생기는 대로 그린다.
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { mode?: "new" | "revise"; request?: string; flowId?: string; name?: string };
  const plan = planFlowGen(id, body);
  if ("error" in plan) return plan.status === 404 ? notFound() : bad(plan.error, plan.status);

  const r = await generateJson({ task: "flow.generate", system: MANNY_SYSTEM, prompt: plan.prompt, schema: flowSchema });
  const { nodes, edges, frames } = normalizeFlow(r.data.nodes, r.data.edges, r.data.frames ?? []);
  const f = flows.create({ projectId: id, name: plan.nameFrom(r.data.name), request: plan.request, nodes, edges, frames });
  activity.log(id, "flow.create", f.name, { mode: plan.mode, nodeCount: nodes.length, frameCount: frames.length }, "manny");
  activity.log(id, "ai.flow", f.name, { mode: plan.mode, usage: r.usage }, "manny");
  return ok(f, { status: 201 });
});
