import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { ITEM_TYPES, PARENT_ITEM_TYPE, PRIORITIES, STATUSES, rid, type Item, type ItemType, type Priority, type Status } from "@/lib/types";

/** GET → Item[] (whole project, flat) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(items.list(id));
});

export interface ItemInput {
  type: ItemType;
  parentId?: string | null;
  title?: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  data?: Partial<Item["data"]>;
  /** insert position among siblings (optional) */
  index?: number;
}
export interface BulkItemInput extends ItemInput {
  tempId: string;
  /** parent given as a tempId from the same batch */
  parentTempId?: string;
}

function validate(projectId: string, input: ItemInput, resolvedParent: string | null): string | null {
  if (!ITEM_TYPES.includes(input.type)) return "invalid type";
  if (input.priority && !PRIORITIES.includes(input.priority)) return "invalid priority";
  if (input.status && !STATUSES.includes(input.status)) return "invalid status";
  const need = PARENT_ITEM_TYPE[input.type];
  if (need === null) { if (resolvedParent) return "요구사항은 상위 항목을 가질 수 없습니다"; return null; }
  if (!resolvedParent) return `${input.type} 항목은 상위 항목이 필요합니다`;
  const parent = items.get(resolvedParent);
  if (!parent || parent.projectId !== projectId) return "상위 항목을 찾을 수 없습니다";
  if (parent.type !== need) return "상위 항목 유형이 맞지 않습니다";
  return null;
}

/**
 * POST single: ItemInput → Item
 * POST bulk:   { items: BulkItemInput[] } → Item[]  (parents may reference earlier rows via parentTempId)
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as ItemInput | { items: BulkItemInput[] };

  if ("items" in body && Array.isArray(body.items)) {
    const idMap = new Map<string, string>();
    const rows = [];
    for (const r of body.items) {
      const realId = rid();
      const parentId = r.parentTempId ? idMap.get(r.parentTempId) ?? null : r.parentId ?? null;
      // when parent is in the same batch we cannot validate via DB; check the batch instead
      if (r.parentTempId) {
        const parentRow = body.items.find((x) => x.tempId === r.parentTempId);
        if (!parentRow || PARENT_ITEM_TYPE[r.type] !== parentRow.type) return bad(`잘못된 상위 항목: ${r.title ?? r.tempId}`);
      } else {
        const err = validate(id, r, parentId);
        if (err) return bad(err);
      }
      idMap.set(r.tempId, realId);
      rows.push({ id: realId, type: r.type, parentId, title: r.title, description: r.description, priority: r.priority, status: r.status, data: r.data });
    }
    const created = items.bulkInsert(id, rows);
    activity.log(id, "item.create", `${created.length}개 항목 일괄 추가`, { count: created.length, titles: created.slice(0, 10).map((c) => c.title) });
    return ok(created, { status: 201 });
  }

  const input = body as ItemInput;
  const err = validate(id, input, input.parentId ?? null);
  if (err) return bad(err);
  const created = items.create({ projectId: id, ...input, parentId: input.parentId ?? null });
  if (typeof input.index === "number") {
    const sib = items.list(id).filter((x) => x.parentId === created.parentId && x.id !== created.id).sort((a, b) => a.order - b.order).map((x) => x.id);
    sib.splice(Math.max(0, Math.min(input.index, sib.length)), 0, created.id);
    items.reorder(id, created.parentId, sib);
  }
  activity.log(id, "item.create", created.title || "(제목 없음)", { itemId: created.id, type: created.type });
  return ok(items.get(created.id), { status: 201 });
});
