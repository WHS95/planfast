import { handler, ok, notFound, type Params } from "@/lib/http";
import { wireframes, activity } from "@/lib/repo";

type P = Params<"id" | "wfId" | "pageId">;

function load(id: string, wfId: string, pageId: string) {
  const wf = wireframes.get(wfId);
  if (!wf || wf.projectId !== id) return null;
  const page = wireframes.getPage(pageId);
  if (!page || page.wireframeId !== wfId) return null;
  return { wf, page };
}

/** PATCH { html?, name?, order? } */
export const PATCH = handler(async (req, { params }: P) => {
  const { id, wfId, pageId } = await params;
  const found = load(id, wfId, pageId);
  if (!found) return notFound();
  const body = (await req.json().catch(() => ({}))) as { html?: string; name?: string; order?: number };
  const patch: { html?: string; name?: string; order?: number; status?: "done" } = {};
  if (typeof body.html === "string") { patch.html = body.html; if (body.html.trim()) patch.status = "done"; }
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.order === "number") patch.order = body.order;
  const page = wireframes.updatePage(pageId, patch)!;
  if (patch.html !== undefined) activity.log(id, "wireframe.page.edit", `${found.wf.name} / ${page.name}`);
  return ok(page);
});

export const DELETE = handler(async (_req, { params }: P) => {
  const { id, wfId, pageId } = await params;
  const found = load(id, wfId, pageId);
  if (!found) return notFound();
  wireframes.removePage(pageId);
  activity.log(id, "wireframe.page.delete", `${found.wf.name} / ${found.page.name}`);
  return ok({ ok: true });
});
