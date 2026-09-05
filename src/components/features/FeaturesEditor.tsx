"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, FileText, FolderTree, Network, Plus, Search, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { CHILD_ITEM_TYPE, type Item } from "@/lib/types";
import { useEditor } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import type { FeaturesGenerateResult } from "@/app/api/projects/[id]/ai/features/route";
import type { ProposalAction } from "@/app/api/projects/[id]/items/proposals/route";
import { useItemStore } from "./store";
import { FeaturesContext, type FeaturesCtx, type ViewMode } from "./FeaturesContext";
import { TreeView } from "./TreeView";
import { DirectoryView } from "./DirectoryView";
import { DocumentView } from "./DocumentView";
import { ancestorIds, colorMap, flattenAll, matchesQuery, numberMap } from "./utils";

const VIEWS: { key: ViewMode; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "tree", label: "트리 뷰", icon: Network },
  { key: "dir", label: "디렉토리 뷰", icon: FolderTree },
  { key: "doc", label: "도큐먼트 뷰", icon: FileText },
];

export function FeaturesEditor({ projectId, initial }: { projectId: string; initial: Item[] }) {
  const store = useItemStore(projectId, initial);
  const { setSelection } = useEditor();
  const [view, setView] = useState<ViewMode>("tree");
  const [rawSelectedId, setSelectedId] = useState<string | null>(null);
  const selectedId = rawSelectedId && store.byId.has(rawSelectedId) ? rawSelectedId : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [ai, setAi] = useState<{ busy: boolean; parentId: string | null }>({ busy: false, parentId: null });
  const [resolving, setResolving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // selection → editor context (for @mention / comments)
  useEffect(() => {
    const it = selectedId ? store.byId.get(selectedId) : undefined;
    setSelection(it ? { type: "item", id: it.id, label: it.title || "(제목 없음)" } : null);
  }, [selectedId, store.byId, setSelection]);
  useEffect(() => () => setSelection(null), [setSelection]);

  // derived tree metadata shared by all three views
  const numbers = useMemo(() => numberMap(store.items), [store.items]);
  const colors = useMemo(() => colorMap(store.items), [store.items]);
  const proposalIds = useMemo(() => store.items.filter((x) => x.aiProposed).map((x) => x.id), [store.items]);

  // search
  const matchIds = useMemo(() => (query.trim() ? flattenAll(store.items).filter((r) => matchesQuery(r.item, query)).map((r) => r.item.id) : []), [store.items, query]);
  const safeIdx = matchIds.length ? Math.min(matchIdx, matchIds.length - 1) : 0;
  const currentMatchId = matchIds[safeIdx] ?? null;
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setCollapsed((c) => { const anc = ancestorIds(store.items, id).filter((a) => c.has(a)); if (!anc.length) return c; const n = new Set(c); anc.forEach((a) => n.delete(a)); return n; });
  }, [store.items]);
  /** jump to match i of `ids` (selects it and expands ancestors) */
  const jump = (ids: string[], i: number) => { setMatchIdx(i); if (ids[i]) select(ids[i]); };
  const changeQuery = (q: string) => {
    setQuery(q);
    jump(q.trim() ? flattenAll(store.items).filter((r) => matchesQuery(r.item, q)).map((r) => r.item.id) : [], 0);
  };
  const step = (d: number) => { if (matchIds.length) jump(matchIds, (safeIdx + d + matchIds.length) % matchIds.length); };
  const toggleCollapse = useCallback((id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const allCollapsible = useMemo(() => store.items.filter((x) => x.type !== "spec" && store.children(x.id).length > 0).map((x) => x.id), [store]);
  const allCollapsed = allCollapsible.length > 0 && allCollapsible.every((id) => collapsed.has(id));

  const addChild = useCallback(async (parentId: string | null, index?: number) => {
    const parent = parentId ? store.byId.get(parentId) : undefined;
    const type = parent ? CHILD_ITEM_TYPE[parent.type] : "requirement";
    if (!type) return;
    const created = await store.create({ type, parentId, title: "", index });
    if (parentId) setCollapsed((c) => { if (!c.has(parentId)) return c; const n = new Set(c); n.delete(parentId); return n; });
    setSelectedId(created.id);
  }, [store]);
  const removeItem = useCallback(async (id: string) => { setSelectedId((cur) => (cur === id ? null : cur)); await store.remove(id); }, [store]);

  /** generate in place: the route persists the rows with aiProposed=true, we just reload */
  const aiGenerate = useCallback(async (parentId: string | null) => {
    setAi({ busy: true, parentId });
    try {
      const r = await api<FeaturesGenerateResult>(`/api/projects/${projectId}/ai/features`, { method: "POST", json: parentId ? { mode: "extend", parentId } : { mode: "generate" } });
      await store.reload();
      if (parentId) setCollapsed((c) => { if (!c.has(parentId)) return c; const n = new Set(c); n.delete(parentId); return n; });
      if (r.created[0]) setSelectedId(r.created[0].id);
    } catch (e) { alert((e as Error).message); } finally { setAi({ busy: false, parentId: null }); }
  }, [projectId, store]);

  const resolveProposals = useCallback(async (action: ProposalAction, ids?: string[]) => {
    setResolving(true);
    try { await store.resolveProposals(action, ids); }
    catch (e) { alert((e as Error).message); await store.reload(); }
    finally { setResolving(false); }
  }, [store]);

  const ctx = useMemo<FeaturesCtx>(() => ({
    projectId, store, view, setView, selectedId, select, collapsed, toggleCollapse, query, matchIds, currentMatchId,
    numbers, colors, proposalIds, resolveProposals, aiGenerate, aiBusy: ai.busy, aiBusyParentId: ai.parentId, addChild, removeItem,
  }), [projectId, store, view, selectedId, select, collapsed, toggleCollapse, query, matchIds, currentMatchId, numbers, colors, proposalIds, resolveProposals, aiGenerate, ai.busy, ai.parentId, addChild, removeItem]);

  return (
    <FeaturesContext.Provider value={ctx}>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-12 border-b bg-panel flex items-center gap-2 px-3 shrink-0">
          <div className="flex rounded-md border p-0.5 bg-bg">
            {VIEWS.map((v) => (
              <button key={v.key} className={clsx("px-2.5 py-1 rounded text-xs flex items-center gap-1 transition-colors", view === v.key ? "bg-panel shadow-sm font-medium text-accent" : "text-muted hover:text-fg")} onClick={() => setView(v.key)}>
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border px-2 h-8 bg-bg ml-2 w-72">
            <Search size={13} className="text-muted shrink-0" />
            <input ref={searchRef} className="bg-transparent outline-none text-sm flex-1 min-w-0" placeholder="검색 (제목·설명·슬롯)" value={query} onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") step(e.shiftKey ? -1 : 1); if (e.key === "Escape") changeQuery(""); }} />
            {query && <span className="text-[11px] text-muted tabular-nums shrink-0">{matchIds.length ? `${safeIdx + 1}/${matchIds.length}` : "0/0"}</span>}
            {query && (
              <>
                <button className="btn btn-icon !p-0.5" title="이전 (Shift+Enter)" disabled={!matchIds.length} onClick={() => step(-1)}><ChevronUp size={13} /></button>
                <button className="btn btn-icon !p-0.5" title="다음 (Enter)" disabled={!matchIds.length} onClick={() => step(1)}><ChevronDown size={13} /></button>
                <button className="btn btn-icon !p-0.5" title="지우기" onClick={() => changeQuery("")}><X size={13} /></button>
              </>
            )}
          </div>
          <span className="text-[11px] text-muted ml-1">{store.saving ? "저장 중…" : "저장됨"}</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-sm btn-ghost text-muted" disabled={!allCollapsible.length} onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allCollapsible))}>
              {allCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />} {allCollapsed ? "전체 펼치기" : "전체 접기"}
            </button>
            <button className="btn btn-sm" onClick={() => void addChild(null)}><Plus size={13} /> 요구사항 추가</button>
            <button className="btn btn-sm btn-primary" disabled={ai.busy} onClick={() => void aiGenerate(null)}>{ai.busy ? <Spinner className="w-3 h-3" /> : <Sparkles size={13} />} 매니로 기능 생성</button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {proposalIds.length > 0 && (
            <motion.div key="proposal-bar" className="shrink-0 overflow-hidden border-b"
              initial={{ height: 0, opacity: 0 }} animate={{ height: 36, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ background: "var(--accent-soft)" }}>
              <div className="h-9 flex items-center gap-2 px-3 text-xs">
                <Sparkles size={13} className="text-accent shrink-0" />
                <span className="font-medium text-accent">매니 제안 {proposalIds.length}개</span>
                <span className="text-muted hidden sm:inline">· 검토 후 승인하면 명세서에 반영됩니다.</span>
                <div className="ml-auto flex items-center gap-1">
                  {resolving && <Spinner className="w-3 h-3 text-accent" />}
                  <button className="btn btn-sm btn-ghost text-muted hover:text-danger" disabled={resolving} onClick={() => { if (confirm(`매니 제안 ${proposalIds.length}개를 모두 삭제할까요?`)) void resolveProposals("reject"); }}><X size={12} /> 전체 거절</button>
                  <button className="btn btn-sm btn-primary" disabled={resolving} onClick={() => void resolveProposals("approve")}><Check size={12} /> 전체 승인</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === "tree" && <TreeView />}
        {view === "dir" && <DirectoryView />}
        {view === "doc" && <DocumentView />}
      </div>
      {ai.busy && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 card px-4 py-2 text-sm flex items-center gap-2 shadow-lg"><Spinner /> 매니가 {ai.parentId ? "하위 항목" : "기능명세서"}를 작성하는 중입니다… (10~60초)</div>
      )}
    </FeaturesContext.Provider>
  );
}
