"use client";
import { useState } from "react";
import clsx from "clsx";
import { ChevronRight, FileText, GripVertical, Plus } from "lucide-react";
import type { Page } from "@/lib/types";
import { childrenOf, flatten } from "./types";

interface Props {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
  onAddRoot: () => void;
}

/** 좌측 트리 목록: 들여쓰기 + 형제 간 드래그 정렬 (native DnD) */
export function PageList({ pages, selectedId, onSelect, onReorder, onAddRoot }: Props) {
  const rows = flatten(pages);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const hidden = new Set<string>();
  for (const { page } of rows) {
    if (page.parentId && (collapsed.has(page.parentId) || hidden.has(page.parentId))) hidden.add(page.id);
  }

  function drop(targetId: string) {
    if (!dragId || dragId === targetId || !over) return;
    const src = pages.find((p) => p.id === dragId); const dst = pages.find((p) => p.id === targetId);
    if (!src || !dst || src.parentId !== dst.parentId) return; // siblings only
    const sib = childrenOf(pages, dst.parentId).map((p) => p.id).filter((id) => id !== dragId);
    const idx = sib.indexOf(targetId) + (over.pos === "after" ? 1 : 0);
    sib.splice(idx, 0, dragId);
    onReorder(dst.parentId, sib);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-medium text-muted border-b flex items-center justify-between">
        페이지 목록 <span className="text-muted/70">{pages.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {rows.length === 0 && <div className="text-xs text-muted px-3 py-6 text-center">아직 페이지가 없습니다.</div>}
        {rows.map(({ page, depth }) => {
          if (hidden.has(page.id)) return null;
          const hasKids = pages.some((p) => p.parentId === page.id);
          const src = pages.find((p) => p.id === dragId);
          const canDrop = !!src && src.id !== page.id && src.parentId === page.parentId;
          return (
            <div
              key={page.id}
              draggable
              onDragStart={(e) => { setDragId(page.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDragId(null); setOver(null); }}
              onDragOver={(e) => { if (!canDrop) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: page.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" }); }}
              onDragLeave={() => setOver((o) => (o?.id === page.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(page.id); setDragId(null); setOver(null); }}
              onClick={() => onSelect(page.id)}
              style={{ paddingLeft: 8 + depth * 14 }}
              className={clsx(
                "group flex items-center gap-1 pr-2 py-1 text-[13px] cursor-pointer select-none relative",
                selectedId === page.id ? "bg-accent-soft text-accent" : "hover:bg-black/[.03] dark:hover:bg-white/[.04]",
                dragId === page.id && "opacity-40",
              )}
            >
              {over?.id === page.id && canDrop && <div className={clsx("absolute left-2 right-2 h-0.5 bg-accent rounded", over.pos === "before" ? "top-0" : "bottom-0")} />}
              <GripVertical size={12} className="text-muted/50 opacity-0 group-hover:opacity-100 shrink-0" />
              <button
                className={clsx("w-4 h-4 flex items-center justify-center text-muted shrink-0", !hasKids && "invisible")}
                onClick={(e) => { e.stopPropagation(); setCollapsed((s) => { const n = new Set(s); if (n.has(page.id)) n.delete(page.id); else n.add(page.id); return n; }); }}
              >
                <ChevronRight size={12} className={clsx("transition-transform", !collapsed.has(page.id) && "rotate-90")} />
              </button>
              <FileText size={12} className="text-muted shrink-0" />
              <span className="truncate">{page.name || "(이름 없음)"}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t p-2">
        <button className="btn btn-ghost btn-sm text-muted w-full justify-start" onClick={onAddRoot}><Plus size={13} /> 최상위 페이지 추가</button>
      </div>
    </div>
  );
}
