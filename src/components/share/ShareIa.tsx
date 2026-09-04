"use client";
import { FileText } from "lucide-react";
import type { Item, Page } from "@/lib/types";
import { Empty } from "@/components/ui";
import { Scroll } from "./ShareView";

export function ShareIa({ pages, items }: { pages: Page[]; items: Item[] }) {
  const byParent = new Map<string | null, Page[]>();
  for (const p of pages) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p]);
  const kids = (id: string | null) => (byParent.get(id) ?? []).sort((a, b) => a.order - b.order);
  const specName = (id: string) => items.find((i) => i.id === id)?.title;
  const render = (parent: string | null, depth: number): React.ReactNode => kids(parent).map((p) => (
    <li key={p.id}>
      <div className="flex items-start gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <FileText size={14} className="text-muted mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{p.name}</div>
          {p.description && <div className="text-xs text-muted whitespace-pre-wrap">{p.description}</div>}
          {p.linkedSpecIds.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{p.linkedSpecIds.map((id) => specName(id) && <span key={id} className="chip text-muted">{specName(id)}</span>)}</div>}
        </div>
      </div>
      <ul>{render(p.id, depth + 1)}</ul>
    </li>
  ));
  return <Scroll>{pages.length === 0 ? <Empty>정보구조도가 아직 없어요</Empty> : <ul>{render(null, 0)}</ul>}</Scroll>;
}
