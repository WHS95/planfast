import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { pages, activity } from "@/lib/repo";

/** PATCH { name?, description?, parentId?, order?, linkedSpecIds? } */
export const PATCH = handler(async (req, { params }: Params<"id" | "pageId">) => {
  const { id, pageId } = await params;
  const cur = pages.get(pageId);
  if (!cur || cur.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof pages.update>[1] = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.description === "string") patch.description = body.description;
  if (Array.isArray(body.linkedSpecIds)) patch.linkedSpecIds = body.linkedSpecIds.filter((x): x is string => typeof x === "string");
  if (typeof body.order === "number") patch.order = body.order;
  if ("parentId" in body) {
    const parentId = (body.parentId as string | null) ?? null;
    if (parentId) {
      if (parentId === pageId) return bad("cannot parent to self");
      const target = pages.get(parentId);
      if (!target || target.projectId !== id) return bad("invalid parentId");
      // prevent cycles: target must not be a descendant of this page
      const all = pages.list(id);
      let cursor: string | null = parentId;
      while (cursor) { if (cursor === pageId) return bad("cannot move under own descendant"); cursor = all.find((p) => p.id === cursor)?.parentId ?? null; }
    }
    patch.parentId = parentId;
    if (patch.order === undefined && parentId !== cur.parentId) {
      const sib = pages.list(id).filter((p) => p.parentId === parentId && p.id !== pageId);
      patch.order = sib.length ? Math.max(...sib.map((p) => p.order)) + 1 : 0;
    }
  }
  const p = pages.update(pageId, patch);
  activity.log(id, "page.update", p?.name ?? cur.name);
  return ok(p);
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "pageId">) => {
  const { id, pageId } = await params;
  const cur = pages.get(pageId);
  if (!cur || cur.projectId !== id) return notFound();
  pages.remove(pageId);
  activity.log(id, "page.delete", cur.name);
  return ok({ ok: true });
});
