import { SPEC_SLOTS, type Item, type ItemType, type SpecData } from "@/lib/types";

export const TYPE_CLASS: Record<ItemType, string> = {
  requirement: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  feature: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  spec: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};
export const DEPTH: Record<ItemType, number> = { requirement: 0, feature: 1, spec: 2 };

export function childrenOf(list: Item[], parentId: string | null): Item[] {
  return list.filter((x) => x.parentId === parentId).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}
export function descendantIds(list: Item[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => { for (const c of list.filter((x) => x.parentId === pid)) { out.push(c.id); walk(c.id); } };
  walk(id);
  return out;
}
export function ancestorIds(list: Item[], id: string): string[] {
  const out: string[] = [];
  let cur = list.find((x) => x.id === id);
  while (cur?.parentId) { out.push(cur.parentId); cur = list.find((x) => x.id === cur!.parentId); }
  return out;
}
/** depth-first order of the whole tree (all items, regardless of collapse) */
export function flattenAll(list: Item[]): { item: Item; depth: number }[] {
  const out: { item: Item; depth: number }[] = [];
  const walk = (pid: string | null, depth: number) => { for (const c of childrenOf(list, pid)) { out.push({ item: c, depth }); walk(c.id, depth + 1); } };
  walk(null, 0);
  return out;
}
/** depth-first order, skipping children of collapsed nodes */
export function flattenVisible(list: Item[], collapsed: Set<string>): { item: Item; depth: number }[] {
  const out: { item: Item; depth: number }[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const c of childrenOf(list, pid)) { out.push({ item: c, depth }); if (!collapsed.has(c.id)) walk(c.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}
export function searchText(it: Item): string {
  const parts = [it.title, it.description];
  if (it.type === "spec") for (const s of SPEC_SLOTS) parts.push((it.data as SpecData).slots?.[s] ?? "");
  return parts.join("\n").toLowerCase();
}
export function matchesQuery(it: Item, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !!s && searchText(it).includes(s);
}
