import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { items, activity } from "@/lib/repo";
import { PRIORITIES, STATUSES, type Item } from "@/lib/types";

type Patch = Partial<Pick<Item, "title" | "description" | "priority" | "status">> & { data?: Partial<Item["data"]> };

export const GET = handler(async (_req, { params }: Params<"id" | "itemId">) => {
  const { id, itemId } = await params;
  const it = items.get(itemId);
  return it && it.projectId === id ? ok(it) : notFound();
});

/** PATCH { title?, description?, priority?, status?, data? } → Item */
export const PATCH = handler(async (req, { params }: Params<"id" | "itemId">) => {
  const { id, itemId } = await params;
  const cur = items.get(itemId);
  if (!cur || cur.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as Patch;
  const patch: Patch = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string") patch.description = body.description;
  if (body.priority) { if (!PRIORITIES.includes(body.priority)) return bad("invalid priority"); patch.priority = body.priority; }
  if (body.status) { if (!STATUSES.includes(body.status)) return bad("invalid status"); patch.status = body.status; }
  if (body.data && typeof body.data === "object") patch.data = body.data;
  const next = items.update(itemId, patch)!;
  activity.log(id, "item.update", next.title || "(제목 없음)", { itemId, fields: Object.keys(patch) });
  return ok(next);
});

/** DELETE → { deleted: string[] } (item + descendants) */
export const DELETE = handler(async (_req, { params }: Params<"id" | "itemId">) => {
  const { id, itemId } = await params;
  const cur = items.get(itemId);
  if (!cur || cur.projectId !== id) return notFound();
  const deleted = items.remove(itemId);
  activity.log(id, "item.delete", cur.title || "(제목 없음)", { itemId, type: cur.type, count: deleted.length });
  return ok({ deleted });
});
