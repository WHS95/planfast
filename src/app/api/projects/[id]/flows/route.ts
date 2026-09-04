import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, activity } from "@/lib/repo";
import { FLOW_NODE_TYPES, type FlowEdge, type FlowNode } from "@/lib/types";

export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(flows.list(id));
});

/** POST { name, request?, nodes?, edges? } → Flow (manual/blank flow) */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { name?: string; request?: string; nodes?: FlowNode[]; edges?: FlowEdge[] };
  const name = body.name?.trim();
  if (!name) return bad("name required");
  const nodes = (body.nodes ?? []).filter((n) => FLOW_NODE_TYPES.includes(n.type));
  const f = flows.create({ projectId: id, name, request: body.request ?? "", nodes, edges: body.edges ?? [] });
  activity.log(id, "flow.create", f.name);
  return ok(f, { status: 201 });
});
