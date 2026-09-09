"use client";
/**
 * Client-side item store for the features tab. Optimistic updates + per-item debounced PATCH.
 * All three views read/write through this single store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { broadcastChange, useEditor } from "@/components/editor/EditorContext";
import type { Item, ItemType, Priority, Status } from "@/lib/types";
import type { ItemInput } from "@/app/api/projects/[id]/items/route";
import type { ProposalAction, ProposalsResult } from "@/app/api/projects/[id]/items/proposals/route";
import { childrenOf, descendantIds } from "./utils";

export type ItemPatch = Partial<Pick<Item, "title" | "description" | "priority" | "status">> & { data?: Item["data"] };

export interface ItemStore {
  items: Item[];
  byId: Map<string, Item>;
  saving: boolean;
  children: (parentId: string | null) => Item[];
  update: (id: string, patch: ItemPatch) => void;
  create: (input: ItemInput) => Promise<Item>;
  remove: (id: string) => Promise<void>;
  /** move item under `parentId` at `index` among its siblings */
  move: (id: string, parentId: string | null, index: number) => Promise<void>;
  /** approve/reject AI proposals in one server round-trip. `ids` omitted → every proposal in the project */
  resolveProposals: (action: ProposalAction, ids?: string[]) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * 서버가 스트리밍으로 밀어준 항목을 즉시 반영한다(있으면 갱신, 없으면 추가).
   * AI 생성 중 노드가 하나씩 생겨나는 데 쓴다. 사용자가 편집 중인 항목은 덮어쓰지 않는다.
   */
  upsert: (items: Item[]) => void;
}

function applyPatch(it: Item, patch: ItemPatch): Item {
  return { ...it, ...patch, data: patch.data ?? it.data, updatedAt: new Date().toISOString() };
}

export function useItemStore(projectId: string, initial: Item[]): ItemStore {
  const { tick } = useEditor();
  const [items, setItems] = useState<Item[]>(initial);
  const [inflight, setInflight] = useState(0);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [dirty, setDirty] = useState(0);
  const pending = useRef(new Map<string, { patch: ItemPatch; timer: ReturnType<typeof setTimeout> }>());
  const base = `/api/projects/${projectId}/items`;

  const flush = useCallback(async (id: string) => {
    const p = pending.current.get(id);
    if (!p) return;
    pending.current.delete(id);
    setDirty(pending.current.size);
    setInflight((n) => n + 1);
    try {
      await api(`${base}/${id}`, { method: "PATCH", json: p.patch });
      broadcastChange(projectId);
    } catch (e) {
      console.error(e);
    } finally {
      setInflight((n) => n - 1);
    }
  }, [base, projectId]);

  // flush everything on unmount / navigation
  useEffect(() => {
    const map = pending.current;
    const flushAll = () => { for (const id of [...map.keys()]) { clearTimeout(map.get(id)!.timer); void flush(id); } };
    window.addEventListener("beforeunload", flushAll);
    return () => { window.removeEventListener("beforeunload", flushAll); flushAll(); };
  }, [flush]);

  const reload = useCallback(async () => {
    const server = await api<Item[]>(base);
    setItems((local) => server.map((s) => (pending.current.has(s.id) ? local.find((l) => l.id === s.id) ?? s : s)));
  }, [base]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void reload();
  }, [tick, reload]);

  const update = useCallback((id: string, patch: ItemPatch) => {
    setItems((list) => list.map((it) => (it.id === id ? applyPatch(it, patch) : it)));
    const cur = pending.current.get(id);
    if (cur) clearTimeout(cur.timer);
    const merged: ItemPatch = { ...(cur?.patch ?? {}), ...patch };
    pending.current.set(id, { patch: merged, timer: setTimeout(() => void flush(id), 600) });
    setDirty(pending.current.size);
  }, [flush]);

  const create = useCallback(async (input: ItemInput) => {
    const created = await api<Item>(base, { method: "POST", json: input });
    // server may have re-ordered siblings when index given → refetch siblings cheaply by reloading all
    if (typeof input.index === "number") {
      const server = await api<Item[]>(base);
      setItems((local) => server.map((s) => (pending.current.has(s.id) ? local.find((l) => l.id === s.id) ?? s : s)));
    } else {
      setItems((list) => [...list, created]);
    }
    broadcastChange(projectId);
    return created;
  }, [base, projectId]);

  const remove = useCallback(async (id: string) => {
    const gone = new Set([id, ...descendantIds(itemsRef.current, id)]);
    for (const g of gone) { const p = pending.current.get(g); if (p) { clearTimeout(p.timer); pending.current.delete(g); } }
    setDirty(pending.current.size);
    setItems((list) => list.filter((x) => !gone.has(x.id)));
    await api(`${base}/${id}`, { method: "DELETE" });
    broadcastChange(projectId);
  }, [base, projectId]);

  const move = useCallback(async (id: string, parentId: string | null, index: number) => {
    const list = itemsRef.current;
    const sib = childrenOf(list, parentId).filter((x) => x.id !== id).map((x) => x.id);
    sib.splice(Math.max(0, Math.min(index, sib.length)), 0, id);
    setItems((cur) => cur.map((x) => (sib.includes(x.id) ? { ...x, parentId, order: sib.indexOf(x.id) } : x)));
    await api(`${base}/reorder`, { method: "POST", json: { parentId, orderedIds: sib } });
    broadcastChange(projectId);
  }, [base, projectId]);

  const resolveProposals = useCallback(async (action: ProposalAction, ids?: string[]) => {
    const list = itemsRef.current;
    const roots = ids?.length ? ids : list.filter((x) => x.aiProposed).map((x) => x.id);
    const scope = new Set<string>();
    for (const r of roots) { scope.add(r); for (const d of descendantIds(list, r)) scope.add(d); }
    if (action === "reject") {
      for (const g of scope) { const p = pending.current.get(g); if (p) { clearTimeout(p.timer); pending.current.delete(g); } }
      setDirty(pending.current.size);
      setItems((cur) => cur.filter((x) => !scope.has(x.id)));
    } else {
      setItems((cur) => cur.map((x) => (scope.has(x.id) && x.aiProposed ? { ...x, aiProposed: false, status: x.status === "proposed" ? "writing" : x.status } : x)));
    }
    const r = await api<ProposalsResult>(`${base}/proposals`, { method: "POST", json: { action, ids } });
    setItems((local) => r.items.map((s) => (pending.current.has(s.id) ? local.find((l) => l.id === s.id) ?? s : s)));
    broadcastChange(projectId);
  }, [base, projectId]);

  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  const children = useCallback((parentId: string | null) => childrenOf(items, parentId), [items]);

  const upsert = useCallback((incoming: Item[]) => {
    if (!incoming.length) return;
    setItems((list) => {
      const byIdLocal = new Map(list.map((x) => [x.id, x]));
      for (const it of incoming) {
        if (pending.current.has(it.id)) continue; // 편집 중인 항목은 사용자 입력이 우선
        byIdLocal.set(it.id, it);
      }
      return [...byIdLocal.values()];
    });
  }, []);

  return useMemo<ItemStore>(() => ({ items, byId, saving: inflight > 0 || dirty > 0, children, update, create, remove, move, resolveProposals, reload, upsert }),
    [items, byId, inflight, dirty, children, update, create, remove, move, resolveProposals, reload, upsert]);
}

export type { ItemType, Priority, Status };
