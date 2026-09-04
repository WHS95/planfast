"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Link2, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import type { Page } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { depthOf, type SpecRef } from "./types";

interface Props {
  page: Page;
  pages: Page[];
  specs: SpecRef[];
  busy: string | null;
  onChange: (patch: Partial<Pick<Page, "name" | "description" | "linkedSpecIds">>) => void;
  onAddChild: () => void;
  onAiChildren: () => void;
  onAiEnrich: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function PageDrawer({ page, pages, specs, busy, onChange, onAddChild, onAiChildren, onAiEnrich, onDelete, onClose }: Props) {
  const [name, setName] = useState(page.name);
  const [desc, setDesc] = useState(page.description);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [synced, setSynced] = useState({ id: page.id, name: page.name, description: page.description });
  if (synced.id !== page.id || synced.name !== page.name || synced.description !== page.description) {
    setSynced({ id: page.id, name: page.name, description: page.description });
    setName(page.name); setDesc(page.description);
  }

  const parent = pages.find((p) => p.id === page.parentId);
  const childCount = pages.filter((p) => p.parentId === page.id).length;
  const linked = useMemo(() => page.linkedSpecIds.map((id) => specs.find((s) => s.id === id)).filter((x): x is SpecRef => !!x), [page.linkedSpecIds, specs]);
  const filtered = specs.filter((s) => !q.trim() || `${s.featureTitle} ${s.title}`.toLowerCase().includes(q.toLowerCase()));

  function toggleSpec(id: string) {
    const set = new Set(page.linkedSpecIds);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ linkedSpecIds: [...set] });
  }

  return (
    <div className="w-80 shrink-0 border-l bg-panel flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <div className="text-xs text-muted truncate flex-1">{parent ? `${parent.name} › ` : "최상위 · "}깊이 {depthOf(pages, page) + 1}{childCount ? ` · 하위 ${childCount}` : ""}</div>
        <button className="btn btn-icon text-muted" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="text-[11px] font-medium text-muted">페이지 이름</label>
          <input className="input mt-1" value={name} placeholder="예: 홈, 로그인, 상품 상세" onChange={(e) => { setName(e.target.value); onChange({ name: e.target.value }); }} />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted">설명</label>
          <textarea className="input mt-1 min-h-[88px] resize-y" value={desc} placeholder="이 페이지의 목적과 핵심 요소" onChange={(e) => { setDesc(e.target.value); onChange({ description: e.target.value }); }} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted">연결된 상세기능 ({linked.length})</label>
            <button className="btn btn-ghost btn-sm text-accent" onClick={() => setPicker((v) => !v)}><Link2 size={12} /> 상세기능 연결</button>
          </div>
          {linked.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {linked.map((s) => (
                <span key={s.id} className="chip bg-accent-soft text-accent border-transparent max-w-full" title={s.featureTitle}>
                  <span className="truncate">{s.title}</span>
                  <button onClick={() => toggleSpec(s.id)}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          {picker && (
            <div className="mt-2 border rounded-md overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-bg">
                <Search size={12} className="text-muted" />
                <input autoFocus className="bg-transparent outline-none text-xs flex-1" placeholder="상세기능 검색" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {specs.length === 0 && <div className="text-xs text-muted p-3 text-center">기능명세서에 상세기능이 없습니다.</div>}
                {filtered.map((s) => {
                  const on = page.linkedSpecIds.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSpec(s.id)} className={clsx("w-full text-left flex items-start gap-2 px-2 py-1.5 text-xs hover:bg-black/[.03] dark:hover:bg-white/[.04]", on && "bg-accent-soft/60")}>
                      <span className={clsx("mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0", on ? "bg-accent border-accent text-white" : "bg-panel")}>{on && <Check size={10} />}</span>
                      <span className="min-w-0"><div className="truncate">{s.title || "(제목 없음)"}</div>{s.featureTitle && <div className="text-[10px] text-muted truncate">{s.featureTitle}</div>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="border-t pt-3 space-y-1.5">
          <button className="btn btn-sm w-full justify-start" onClick={onAddChild}><Plus size={13} /> 하위 페이지 추가</button>
          <button className="btn btn-sm w-full justify-start" disabled={busy !== null} onClick={onAiChildren}>{busy === "children" ? <Spinner /> : <Sparkles size={13} />} 매니로 하위 페이지 생성</button>
          <button className="btn btn-sm w-full justify-start" disabled={busy !== null} onClick={onAiEnrich}>{busy === "enrich-one" ? <Spinner /> : <Wand2 size={13} />} 매니로 설명 보강</button>
        </div>
      </div>
      <div className="border-t p-3">
        <button className="btn btn-sm btn-ghost text-danger w-full justify-start" onClick={onDelete}><Trash2 size={13} /> 삭제{childCount ? ` (하위 ${childCount}개 포함)` : ""}</button>
      </div>
    </div>
  );
}
