import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { wireframes, activity } from "@/lib/repo";
import { isRunning } from "@/lib/wireframe/generator";
import type { Device } from "@/lib/types";

type P = Params<"id" | "wfId">;

export const GET = handler(async (_req, { params }: P) => {
  const { id, wfId } = await params;
  const wf = wireframes.get(wfId);
  if (!wf || wf.projectId !== id) return notFound();
  return ok({ ...wf, running: isRunning(wf.id), pages: wireframes.pages(wf.id) });
});

/** PATCH { name?, device?, request?, orderedIds? } */
export const PATCH = handler(async (req, { params }: P) => {
  const { id, wfId } = await params;
  const wf = wireframes.get(wfId);
  if (!wf || wf.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as { name?: string; device?: Device; request?: string; orderedIds?: string[] };
  if (body.device && body.device !== "desktop" && body.device !== "mobile") return bad("invalid device");
  const patch: { name?: string; device?: Device; request?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.device) patch.device = body.device;
  if (typeof body.request === "string") patch.request = body.request;
  if (Object.keys(patch).length) wireframes.update(wfId, patch);
  if (Array.isArray(body.orderedIds)) {
    const mine = new Set(wireframes.pages(wfId).map((p) => p.id));
    body.orderedIds.filter((pid) => mine.has(pid)).forEach((pid, i) => wireframes.updatePage(pid, { order: i }));
  }
  if (patch.name) activity.log(id, "wireframe.rename", patch.name);
  return ok({ ...wireframes.get(wfId)!, running: isRunning(wfId), pages: wireframes.pages(wfId) });
});

export const DELETE = handler(async (_req, { params }: P) => {
  const { id, wfId } = await params;
  const wf = wireframes.get(wfId);
  if (!wf || wf.projectId !== id) return notFound();
  if (isRunning(wfId)) return bad("생성 중인 와이어프레임은 삭제할 수 없습니다. 잠시 후 다시 시도하세요.", 409);
  wireframes.remove(wfId);
  activity.log(id, "wireframe.delete", wf.name);
  return ok({ ok: true });
});
