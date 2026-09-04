import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, pages, activity } from "@/lib/repo";

/** POST { parentId: string|null, orderedIds: string[] } — sets order (and parent) for the listed pages */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { parentId?: string | null; orderedIds?: string[] };
  const parentId = body.parentId ?? null;
  const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds : [];
  if (!orderedIds.length) return bad("orderedIds required");
  if (parentId && pages.get(parentId)?.projectId !== id) return bad("invalid parentId");
  if (parentId && orderedIds.includes(parentId)) return bad("cannot parent to self");
  pages.reorder(id, parentId, orderedIds);
  activity.log(id, "page.update", "페이지 순서 변경", { parentId, count: orderedIds.length });
  return ok(pages.list(id));
});
