import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, activity } from "@/lib/repo";
import { FLOW_NODE_TYPES, type FlowEdge, type FlowFrame, type FlowNode } from "@/lib/types";
import { sanitizeFrames } from "@/lib/flow/sanitize";

export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(flows.list(id));
});

/** POST { name, request?, nodes?, edges?, frames? } → Flow (manual/blank flow) */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { name?: string; request?: string; nodes?: FlowNode[]; edges?: FlowEdge[]; frames?: FlowFrame[] };
  const name = body.name?.trim();
  if (!name) return bad("name required");
  const frames = sanitizeFrames(body.frames ?? []);
  const frameIds = new Set(frames.map((f) => f.id));
  const nodes = (body.nodes ?? [])
    .filter((n) => FLOW_NODE_TYPES.includes(n.type))
    .map((n) => (n.frameId && !frameIds.has(n.frameId) ? { ...n, frameId: undefined } : n));
  const f = flows.create({ projectId: id, name, request: body.request ?? "", nodes, edges: body.edges ?? [], frames });
  activity.log(id, "flow.create", f.name);
  return ok(f, { status: 201 });
});
