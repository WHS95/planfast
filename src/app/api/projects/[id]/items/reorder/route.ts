import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { PARENT_ITEM_TYPE } from "@/lib/types";

/** POST { parentId: string|null, orderedIds: string[] } → Item[] — sets parent + order for the given ids */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const { parentId = null, orderedIds } = (await req.json().catch(() => ({}))) as { parentId?: string | null; orderedIds?: string[] };
  if (!Array.isArray(orderedIds) || orderedIds.some((x) => typeof x !== "string")) return bad("orderedIds required");
  const parent = parentId ? items.get(parentId) : null;
  if (parentId && (!parent || parent.projectId !== id)) return bad("상위 항목을 찾을 수 없습니다");
  const all = items.list(id);
  for (const oid of orderedIds) {
    const it = all.find((x) => x.id === oid);
    if (!it) return bad(`항목을 찾을 수 없습니다: ${oid}`);
    const need = PARENT_ITEM_TYPE[it.type];
    if ((parent?.type ?? null) !== need) return bad(`'${it.title}' 항목은 이 위치로 이동할 수 없습니다`);
    if (parentId === oid) return bad("자기 자신 아래로 이동할 수 없습니다");
  }
  items.reorder(id, parentId, orderedIds);
  activity.log(id, "item.update", parent ? `'${parent.title}' 하위 순서 변경` : "요구사항 순서 변경", { parentId, count: orderedIds.length });
  return ok(items.list(id));
});
