import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, wireframes, activity } from "@/lib/repo";
import { startGeneration, isRunning } from "@/lib/wireframe/generator";
import type { Device } from "@/lib/types";

/** GET → wireframes with pages (html omitted; use detail for html) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const list = wireframes.list(id).map((wf) => ({ ...wf, running: isRunning(wf.id), pages: wireframes.withUseCases(wf, wireframes.pages(wf.id)).map((p) => ({ ...p, html: "" })) }));
  return ok(list);
});

/** POST { flowId, device, nodeIds: string[], name?, request? } → create wireframe + pages and start generation */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { flowId?: string; device?: Device; nodeIds?: string[]; name?: string; request?: string };
  const flow = body.flowId ? flows.get(body.flowId) : undefined;
  if (!flow || flow.projectId !== id) return bad("유저플로우를 선택하세요");
  const device: Device = body.device === "mobile" ? "mobile" : "desktop";
  const wanted = new Set(body.nodeIds ?? []);
  const nodes = flow.nodes.filter((n) => n.type === "page" && wanted.has(n.id));
  if (!nodes.length) return bad("페이지를 하나 이상 선택하세요");
  const wf = wireframes.create({ projectId: id, flowId: flow.id, name: body.name?.trim() || `${flow.name} · ${device === "mobile" ? "모바일" : "데스크톱"}`, device, request: body.request ?? "" });
  // 유즈케이스 = 그 노드가 속한 플로우 프레임(스윔레인). 화면을 상황별로 묶어 보여주기 위한 스냅샷.
  const frameLabel = new Map(flow.frames.map((f) => [f.id, f.label]));
  nodes.forEach((n, i) => wireframes.addPage({
    wireframeId: wf.id,
    name: n.label || `페이지 ${i + 1}`,
    useCase: (n.frameId && frameLabel.get(n.frameId)) || "",
    sourceNodeId: n.id,
    order: i,
  }));
  activity.log(id, "wireframe.create", wf.name, { pages: nodes.length, device });
  startGeneration(wf.id, { mode: "continue" });
  return ok({ ...wf, running: isRunning(wf.id), pages: wireframes.pages(wf.id) }, { status: 201 });
});
