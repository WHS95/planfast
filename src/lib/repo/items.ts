import { all, get, run, tx, j } from "@/lib/db";
import { now, rid, type Item, type ItemType, type Priority, type Status } from "@/lib/types";
import { projects } from "./projects";

function map(r: Record<string, unknown>): Item {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    type: r.type as ItemType,
    parentId: (r.parent_id as string) ?? null,
    order: r.order as number,
    title: r.title as string,
    description: r.description as string,
    priority: r.priority as Priority,
    status: r.status as Status,
    data: j(r.data, {}) as Item["data"],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export interface CreateItemInput {
  projectId: string; type: ItemType; parentId?: string | null; title?: string; description?: string;
  priority?: Priority; status?: Status; data?: Partial<Item["data"]>; order?: number; id?: string;
}

function defaultData(type: ItemType): Item["data"] {
  if (type === "requirement") return { acceptance: [] };
  if (type === "feature") return { roles: [], rationale: "", successCriteria: "" };
  return { slots: {}, hiddenSlots: [] };
}

export const items = {
  list(projectId: string): Item[] {
    return all('SELECT * FROM items WHERE project_id=? ORDER BY "order", created_at', projectId).map(map);
  },
  get(id: string): Item | undefined {
    const r = get("SELECT * FROM items WHERE id=?", id);
    return r ? map(r) : undefined;
  },
  create(input: CreateItemInput): Item {
    const id = input.id ?? rid();
    const t = now();
    const order = input.order ?? ((get<{ m: number | null }>(
      'SELECT MAX("order") m FROM items WHERE project_id=? AND (parent_id IS ? OR parent_id = ?)',
      input.projectId, input.parentId ?? null, input.parentId ?? null,
    )?.m ?? -1) + 1);
    run(
      'INSERT INTO items (id,project_id,type,parent_id,"order",title,description,priority,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      id, input.projectId, input.type, input.parentId ?? null, order, input.title ?? "", input.description ?? "",
      input.priority ?? "medium", input.status ?? "writing", JSON.stringify({ ...defaultData(input.type), ...(input.data ?? {}) }), t, t,
    );
    projects.touch(input.projectId);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Item, "title" | "description" | "priority" | "status" | "parentId" | "order">> & { data?: Partial<Item["data"]> }): Item | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, data: patch.data ? { ...cur.data, ...patch.data } : cur.data };
    run(
      'UPDATE items SET title=?, description=?, priority=?, status=?, parent_id=?, "order"=?, data=?, updated_at=? WHERE id=?',
      next.title, next.description, next.priority, next.status, next.parentId, next.order, JSON.stringify(next.data), now(), id,
    );
    projects.touch(cur.projectId);
    return this.get(id);
  },
  /** delete item and all descendants */
  remove(id: string): string[] {
    const cur = this.get(id);
    if (!cur) return [];
    const allItems = this.list(cur.projectId);
    const toDelete = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of allItems) if (it.parentId && toDelete.has(it.parentId) && !toDelete.has(it.id)) { toDelete.add(it.id); changed = true; }
    }
    tx(() => { for (const d of toDelete) run("DELETE FROM items WHERE id=?", d); });
    projects.touch(cur.projectId);
    return [...toDelete];
  },
  /** reorder siblings: ids in desired order */
  reorder(projectId: string, parentId: string | null, orderedIds: string[]) {
    tx(() => {
      orderedIds.forEach((id, i) => run('UPDATE items SET "order"=?, parent_id=?, updated_at=? WHERE id=? AND project_id=?', i, parentId, now(), id, projectId));
    });
    projects.touch(projectId);
  },
  bulkInsert(projectId: string, rows: Omit<CreateItemInput, "projectId">[]): Item[] {
    return tx(() => rows.map((r) => items.create({ ...r, projectId })));
  },
};

/** Build tree helpers usable both server and client */
export function buildTree(list: Item[]) {
  const byParent = new Map<string | null, Item[]>();
  for (const it of list) {
    const arr = byParent.get(it.parentId) ?? [];
    arr.push(it);
    byParent.set(it.parentId, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order);
  return byParent;
}
