"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, LayoutList, Plus, Sparkles, Wand2 } from "lucide-react";
import { api, debounce } from "@/lib/api";
import { rid, type Page } from "@/lib/types";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import { IaCanvas } from "./IaCanvas";
import { PageList } from "./PageList";
import { PageDrawer } from "./PageDrawer";
import { IaProposals } from "./IaProposals";
import { childrenOf, type IaProposal, type ProposedPage, type SpecRef, type ViewMode } from "./types";

type AiTree = { name: string; description: string; children?: AiTree[] };
const toProposed = (list: AiTree[]): ProposedPage[] => list.map((n) => ({ key: rid(), name: n.name, description: n.description ?? "", checked: true, children: toProposed(n.children ?? []) }));
const toBulk = (list: ProposedPage[]): { name: string; description: string; children: unknown[] }[] =>
  list.filter((p) => p.checked).map((p) => ({ name: p.name, description: p.description, children: toBulk(p.children) }));

export function IaEditor({ projectId, initialPages, initialSpecs }: { projectId: string; initialPages: Page[]; initialSpecs: SpecRef[] }) {
  const { tick } = useEditor();
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [specs, setSpecs] = useState<SpecRef[]>(initialSpecs);
  const [view, setView] = useState<ViewMode>("detail");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IaProposal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState(true);
  const first = useRef(true);

  const reload = useCallback(async () => {
    const r = await api<{ pages: Page[]; specs: SpecRef[] }>(`/api/projects/${projectId}/pages?withSpecs=1`);
    setPages(r.pages); setSpecs(r.specs);
  }, [projectId]);
  useEffect(() => { if (first.current) { first.current = false; return; } reload(); }, [tick, reload]);

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  // ---- mutations
  async function createPage(parentId: string | null, name = "새 페이지") {
    const p = await api<Page>(`/api/projects/${projectId}/pages`, { method: "POST", json: { name, parentId } });
    setPages((ps) => [...ps, p]); setSelectedId(p.id); broadcastChange(projectId);
  }
  const savers = useRef(new Map<string, () => void>());
  const pending = useRef(new Map<string, Partial<Page>>());
  function patchPage(id: string, patch: Partial<Pick<Page, "name" | "description" | "linkedSpecIds">>) {
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setSaved(false);
    pending.current.set(id, { ...(pending.current.get(id) ?? {}), ...patch });
    if (!savers.current.has(id)) {
      savers.current.set(id, debounce(() => {
        const body = pending.current.get(id); pending.current.delete(id);
        if (!body) return;
        api(`/api/projects/${projectId}/pages/${id}`, { method: "PATCH", json: body }).then(() => { setSaved(true); broadcastChange(projectId); }).catch((e) => alert((e as Error).message));
      }, 600));
    }
    savers.current.get(id)!();
  }
  async function reparent(id: string, parentId: string | null) {
    try {
      const p = await api<Page>(`/api/projects/${projectId}/pages/${id}`, { method: "PATCH", json: { parentId } });
      setPages((ps) => ps.map((x) => (x.id === id ? p : x))); broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); await reload(); }
  }
  async function reorder(parentId: string | null, orderedIds: string[]) {
    setPages((ps) => ps.map((p) => { const i = orderedIds.indexOf(p.id); return i >= 0 ? { ...p, order: i, parentId } : p; }));
    const list = await api<Page[]>(`/api/projects/${projectId}/pages/reorder`, { method: "POST", json: { parentId, orderedIds } });
    setPages(list); broadcastChange(projectId);
  }
  async function removePage(id: string) {
    const p = pages.find((x) => x.id === id); if (!p) return;
    const kids = childrenOf(pages, id).length;
    if (!confirm(`"${p.name}" 페이지를 삭제할까요?${kids ? ` 하위 페이지도 함께 삭제됩니다.` : ""}`)) return;
    await api(`/api/projects/${projectId}/pages/${id}`, { method: "DELETE" });
    setSelectedId(null); await reload(); broadcastChange(projectId);
  }

  // ---- AI
  async function ai(mode: "generate" | "children" | "enrich", pageId?: string) {
    setBusy(mode === "enrich" && pageId ? "enrich-one" : mode); setMenu(false);
    try {
      const r = await api<{ pages?: AiTree[]; parentId?: string | null; updates?: { id: string; name: string; description: string }[] }>(`/api/projects/${projectId}/ai/ia`, { method: "POST", json: { mode, pageId } });
      if (mode === "enrich") setProposal({ kind: "enrich", updates: (r.updates ?? []).map((u) => ({ ...u, checked: true })) });
      else setProposal({ kind: "tree", parentId: r.parentId ?? null, pages: toProposed(r.pages ?? []) });
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }
  async function acceptProposal() {
    if (!proposal) return;
    setBusy("accept");
    try {
      if (proposal.kind === "tree") {
        await api(`/api/projects/${projectId}/pages`, { method: "POST", json: { bulk: toBulk(proposal.pages), parentId: proposal.parentId } });
      } else {
        for (const u of proposal.updates.filter((x) => x.checked)) await api(`/api/projects/${projectId}/pages/${u.id}`, { method: "PATCH", json: { name: u.name, description: u.description } });
      }
      setProposal(null); await reload(); broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-64 shrink-0 border-r bg-panel min-h-0">
        <PageList pages={pages} selectedId={selectedId} onSelect={setSelectedId} onReorder={reorder} onAddRoot={() => createPage(null)} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-11 border-b bg-panel flex items-center px-3 gap-2 shrink-0">
          <h1 className="text-sm font-semibold">정보구조도</h1>
          <span className="text-[11px] text-muted">{pages.length}개 페이지 · {saved ? "저장됨" : "저장 중…"}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button className={clsx("px-2.5 py-1", view === "detail" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setView("detail")}>상세히 보기</button>
              <button className={clsx("px-2.5 py-1 border-l", view === "simple" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setView("simple")}>간단히 보기</button>
            </div>
            <button className="btn btn-sm" onClick={() => createPage(null)}><Plus size={13} /> 최상위 페이지</button>
            <div className="relative">
              <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => setMenu((v) => !v)}>
                {busy && busy !== "accept" ? <Spinner /> : <Sparkles size={13} />} 매니로 생성 <ChevronDown size={12} />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 mt-1 w-60 card shadow-lg z-20 py-1 text-sm">
                    <button className="w-full text-left px-3 py-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] flex items-center gap-2" onClick={() => ai("generate")}><LayoutList size={14} className="text-muted" /><div><div>정보구조도 생성</div><div className="text-[11px] text-muted">PRD·기능명세서로 페이지 트리 제안</div></div></button>
                    <button className="w-full text-left px-3 py-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] flex items-center gap-2 disabled:opacity-50" disabled={!pages.length} onClick={() => ai("enrich")}><Wand2 size={14} className="text-muted" /><div><div>설명 보강</div><div className="text-[11px] text-muted">기존 페이지 이름/설명 다듬기</div></div></button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          {pages.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-sm text-muted">
                <div className="mb-3">아직 페이지가 없습니다. 최상위 페이지를 추가하거나 매니에게 생성을 요청하세요.</div>
                <div className="flex gap-2 justify-center">
                  <button className="btn btn-sm" onClick={() => createPage(null, "홈")}><Plus size={13} /> 홈 페이지 추가</button>
                  <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => ai("generate")}>{busy === "generate" ? <Spinner /> : <Sparkles size={13} />} 매니로 생성</button>
                </div>
              </div>
            </div>
          ) : (
            <IaCanvas pages={pages} specs={specs} view={view} selectedId={selectedId} onSelect={setSelectedId} onReparent={reparent} />
          )}
          {pages.length > 0 && <div className="absolute bottom-3 left-3 text-[11px] text-muted bg-panel/80 rounded px-2 py-1 pointer-events-none">노드를 다른 노드 위로 드래그하면 하위 페이지가 되고, 빈 곳에 놓으면 최상위가 됩니다.</div>}
        </div>
      </div>
      {proposal ? (
        <IaProposals proposal={proposal} pages={pages} onChange={setProposal} onAccept={acceptProposal} onReject={() => setProposal(null)} busy={busy === "accept"} />
      ) : selected ? (
        <PageDrawer key={selected.id} page={selected} pages={pages} specs={specs} busy={busy}
          onChange={(patch) => patchPage(selected.id, patch)}
          onAddChild={() => createPage(selected.id)}
          onAiChildren={() => ai("children", selected.id)}
          onAiEnrich={() => ai("enrich", selected.id)}
          onDelete={() => removePage(selected.id)}
          onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
