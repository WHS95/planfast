"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
import { ITEM_TYPE_LABEL, PARENT_ITEM_TYPE, type Item } from "@/lib/types";
import { useFeatures } from "./FeaturesContext";
import { ItemDrawer } from "./ItemDetail";
import { Highlight } from "./Highlight";
import { NewBadge, NumTag, PriorityBars, StatusChip } from "./controls";
import { TYPE_CLASS, descendantIds, flattenVisible, matchesQuery, tint } from "./utils";

type DropPos = "before" | "after" | "into";

export function DirectoryView() {
  const { store, selectedId, select, collapsed, toggleCollapse, query, currentMatchId, addChild, numbers, colors } = useFeatures();
  const rows = useMemo(() => flattenVisible(store.items, collapsed), [store.items, collapsed]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: DropPos } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentMatchId) return;
    listRef.current?.querySelector(`[data-item-id="${currentMatchId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentMatchId]);

  const idx = rows.findIndex((r) => r.item.id === selectedId);
  const selected = selectedId ? store.byId.get(selectedId) : undefined;

  function allowed(drag: Item, target: Item, pos: DropPos): boolean {
    if (drag.id === target.id) return false;
    if (descendantIds(store.items, drag.id).includes(target.id)) return false;
    if (pos === "into") return PARENT_ITEM_TYPE[drag.type] === target.type;
    return drag.type === target.type;
  }
  function posFor(e: React.DragEvent, target: Item, drag: Item): DropPos | null {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const canInto = PARENT_ITEM_TYPE[drag.type] === target.type;
    let pos: DropPos = canInto ? (y < 0.25 ? "before" : y > 0.75 ? "after" : "into") : y < 0.5 ? "before" : "after";
    if (!allowed(drag, target, pos)) { pos = canInto ? "into" : pos; if (!allowed(drag, target, pos)) return null; }
    return pos;
  }
  async function drop(target: Item, pos: DropPos) {
    const drag = dragId ? store.byId.get(dragId) : undefined;
    setOver(null); setDragId(null);
    if (!drag || !allowed(drag, target, pos)) return;
    if (pos === "into") { await store.move(drag.id, target.id, store.children(target.id).length); if (collapsed.has(target.id)) toggleCollapse(target.id); return; }
    const sib = store.children(target.parentId).filter((x) => x.id !== drag.id);
    const i = sib.findIndex((x) => x.id === target.id);
    await store.move(drag.id, target.parentId, pos === "before" ? i : i + 1);
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden">
      {/* the drawer overlays the list, so reserve its width to keep every row clickable/droppable */}
      <div ref={listRef} className="absolute inset-0 overflow-y-auto py-2 transition-[padding] duration-200" style={{ paddingRight: selected ? 420 : 0 }}>
        <div className="max-w-3xl mx-auto px-3">
          {rows.length === 0 && <div className="text-sm text-muted px-4 py-6 text-center">항목이 없습니다.</div>}
          {rows.map(({ item, depth }) => {
            const kids = store.children(item.id).length;
            const isOver = over?.id === item.id;
            const color = colors.get(item.id) ?? "var(--line)";
            const isReq = item.type === "requirement";
            return (
              <div key={item.id} data-item-id={item.id} draggable
                onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { const d = dragId ? store.byId.get(dragId) : undefined; if (!d) return; const p = posFor(e, item, d); if (p) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!isOver || over.pos !== p) setOver({ id: item.id, pos: p }); } }}
                onDragLeave={() => isOver && setOver(null)}
                onDrop={(e) => { e.preventDefault(); if (over) void drop(item, over.pos); }}
                onDragEnd={() => { setDragId(null); setOver(null); }}
                onClick={() => select(item.id)}
                className={clsx("group flex items-center gap-1.5 pr-2 py-1.5 my-0.5 rounded-md text-sm cursor-pointer select-none relative transition-colors",
                  selectedId === item.id ? "bg-accent-soft text-accent" : "hover:bg-black/[.03] dark:hover:bg-white/[.04]",
                  currentMatchId === item.id && "outline outline-2 -outline-offset-2 outline-amber-400",
                  isOver && over.pos === "into" && "bg-accent-soft/70 ring-1 ring-accent",
                  dragId === item.id && "opacity-40")}
                style={{
                  marginLeft: depth * 20,
                  borderLeft: `${isReq ? 3 : 2}px solid ${isReq ? color : tint(color, 45, "var(--line)")}`,
                  paddingLeft: 8,
                  background: selectedId === item.id ? undefined : isReq ? tint(color, 5) : undefined,
                }}>
                {isOver && over.pos === "before" && <div className="absolute left-2 right-2 -top-0.5 h-0.5 bg-accent" />}
                {isOver && over.pos === "after" && <div className="absolute left-2 right-2 -bottom-0.5 h-0.5 bg-accent" />}
                <GripVertical size={12} className="text-muted opacity-0 group-hover:opacity-100 shrink-0 cursor-grab" />
                <button className={clsx("w-4 h-4 flex items-center justify-center shrink-0 text-muted", kids === 0 && "invisible")} title={collapsed.has(item.id) ? "펼치기" : "접기"} onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}>
                  {collapsed.has(item.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <NumTag n={numbers.get(item.id) ?? ""} />
                <span className={clsx("chip border-transparent !px-1.5 !py-0 shrink-0", TYPE_CLASS[item.type])}>{ITEM_TYPE_LABEL[item.type][0]}</span>
                <span className={clsx("truncate flex-1", matchesQuery(item, query) && "font-medium")}>{item.title ? <Highlight text={item.title} q={query} /> : <span className="text-muted">(제목 없음)</span>}</span>
                {item.aiProposed && <NewBadge />}
                <PriorityBars priority={item.priority} />
                <span className="hidden group-hover:inline"><StatusChip status={item.status} /></span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color, opacity: isReq ? 1 : 0.55 }} />
              </div>
            );
          })}
          <button className="btn btn-ghost btn-sm text-muted mt-2" onClick={() => void addChild(null)}><Plus size={12} /> 요구사항 추가</button>
        </div>
      </div>
      <AnimatePresence>
        {selected && (
          <ItemDrawer key="drawer" item={selected} onClose={() => select(null)}
            onPrev={idx > 0 ? () => select(rows[idx - 1].item.id) : undefined}
            onNext={idx >= 0 && idx < rows.length - 1 ? () => select(rows[idx + 1].item.id) : undefined} />
        )}
      </AnimatePresence>
    </div>
  );
}
