import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { flows, activity } from "@/lib/repo";
import { FLOW_NODE_TYPES, type FlowEdge, type FlowNode } from "@/lib/types";

export const GET = handler(async (_req, { params }: Params<"id" | "flowId">) => {
  const { id, flowId } = await params;
  const f = flows.get(flowId);
  return f && f.projectId === id ? ok(f) : notFound();
});

/** PATCH { name?, request?, nodes?, edges? } */
export const PATCH = handler(async (req, { params }: Params<"id" | "flowId">) => {
  const { id, flowId } = await params;
  const cur = flows.get(flowId);
  if (!cur || cur.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as { name?: string; request?: string; nodes?: FlowNode[]; edges?: FlowEdge[] };
  const patch: Parameters<typeof flows.update>[1] = {};
  if (typeof body.name === "string") { if (!body.name.trim()) return bad("name required"); patch.name = body.name.trim(); }
  if (typeof body.request === "string") patch.request = body.request;
  if (Array.isArray(body.nodes)) {
    patch.nodes = body.nodes
      .filter((n) => n && typeof n.id === "string" && FLOW_NODE_TYPES.includes(n.type))
      .map((n) => ({ id: n.id, type: n.type, label: String(n.label ?? ""), description: String(n.description ?? ""), position: { x: Number(n.position?.x ?? 0), y: Number(n.position?.y ?? 0) }, ...(n.itemIds ? { itemIds: n.itemIds } : {}) }));
  }
  if (Array.isArray(body.edges)) {
    const ids = new Set((patch.nodes ?? cur.nodes).map((n) => n.id));
    patch.edges = body.edges
      .filter((e) => e && typeof e.id === "string" && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.label ? { label: e.label } : {}) }));
  }
  const f = flows.update(flowId, patch);
  activity.log(id, "flow.update", f?.name ?? cur.name, { renamed: patch.name !== undefined && patch.name !== cur.name });
  return ok(f);
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "flowId">) => {
  const { id, flowId } = await params;
  const cur = flows.get(flowId);
  if (!cur || cur.projectId !== id) return notFound();
  flows.remove(flowId);
  activity.log(id, "flow.delete", cur.name);
  return ok({ ok: true });
});
