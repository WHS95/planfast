"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, LayoutList, Plus, Sparkles, Wand2, LayoutGrid, Table2, AlignHorizontalDistributeCenter, Link2 } from "lucide-react";
import { api, debounce } from "@/lib/api";
import { rid, type Page, type PageMeta } from "@/lib/types";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import { IaCanvas } from "./IaCanvas";
import { IaTable } from "./IaTable";
import { PageList } from "./PageList";
import { PageDrawer } from "./PageDrawer";
import { IaProposals } from "./IaProposals";
import { childrenOf, type IaProposal, type ProposedPage, type SpecRef, type ViewMode } from "./types";
import { useDialog } from "@/components/ui/DialogProvider";

type AiTree = { name: string; description: string; children?: AiTree[] };
const toProposed = (list: AiTree[]): ProposedPage[] => list.map((n) => ({ key: rid(), name: n.name, description: n.description ?? "", checked: true, children: toProposed(n.children ?? []) }));
const toBulk = (list: ProposedPage[]): { name: string; description: string; children: unknown[] }[] =>
  list.filter((p) => p.checked).map((p) => ({ name: p.name, description: p.description, children: toBulk(p.children) }));

export function IaEditor({ projectId, initialPages, initialSpecs }: { projectId: string; initialPages: Page[]; initialSpecs: SpecRef[] }) {
  const { confirm, alert } = useDialog();
  const { tick } = useEditor();
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [specs, setSpecs] = useState<SpecRef[]>(initialSpecs);
  const [view, setView] = useState<ViewMode>("detail");
  const [mode, setMode] = useState<"map" | "table">("map");
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
  const pending = useRef(new Map<string, Partial<Page> & { meta?: PageMeta }>());
  function patchPage(id: string, patch: Partial<Pick<Page, "name" | "description" | "linkedSpecIds">> & { meta?: PageMeta }) {
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, meta: patch.meta ? { ...p.meta, ...patch.meta } : p.meta } : p)));
    setSaved(false);
    const prev = pending.current.get(id) ?? {};
    pending.current.set(id, { ...prev, ...patch, ...(patch.meta || prev.meta ? { meta: { ...prev.meta, ...patch.meta } } : {}) });
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
  /**
   * 캔버스에서 옮긴 좌표 저장. 드래그가 잦아 화면은 먼저 갱신하고, 서버 저장은 모아서 한 번에 보낸다.
   * 저장 대기열을 ref 가 아니라 state 로 두고 effect 에서 debounce 하는 이유는,
   * 렌더 중 ref 를 읽는 패턴(react-hooks/refs)을 피하면서도 마지막 좌표가 항상 반영되게 하기 위함.
   */
  const [pendingMoves, setPendingMoves] = useState<Record<string, { id: string; x: number; y: number }>>({});
  useEffect(() => {
    const positions = Object.values(pendingMoves);
    if (!positions.length) return;
    const t = setTimeout(() => {
      setPendingMoves({});
      api(`/api/projects/${projectId}/pages/layout`, { method: "POST", json: { positions } })
        .then(() => { setSaved(true); broadcastChange(projectId); })
        .catch((e) => alert((e as Error).message));
    }, 500);
    return () => clearTimeout(t);
  }, [pendingMoves, projectId, alert]);
  function movePages(positions: { id: string; x: number; y: number }[]) {
    setPages((ps) => ps.map((p) => { const m = positions.find((q) => q.id === p.id); return m ? { ...p, meta: { ...p.meta, x: m.x, y: m.y } } : p; }));
    setSaved(false);
    setPendingMoves((prev) => ({ ...prev, ...Object.fromEntries(positions.map((p) => [p.id, p])) }));
  }
  async function autoArrange() {
    if (!(await confirm({ message: "저장된 위치를 지우고 계층 구조대로 다시 배치할까요?\n직접 옮겨둔 위치는 사라집니다.", confirmLabel: "자동 정렬" }))) return;
    setBusy("layout");
    try { setPages(await api<Page[]>(`/api/projects/${projectId}/pages/layout`, { method: "POST", json: { reset: true } })); broadcastChange(projectId); }
    catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }

  async function removePage(id: string) {
    const p = pages.find((x) => x.id === id); if (!p) return;
    const kids = childrenOf(pages, id).length;
    if (!(await confirm({ message: `"${p.name}" 페이지를 삭제할까요?${kids ? `\n하위 페이지 ${kids}개도 함께 삭제됩니다.` : ""}`, confirmLabel: "삭제", danger: true }))) return;
    await api(`/api/projects/${projectId}/pages/${id}`, { method: "DELETE" });
    setSelectedId(null); await reload(); broadcastChange(projectId);
  }

  // ---- AI
  async function ai(mode: "generate" | "children" | "enrich" | "link", pageId?: string) {
    setBusy(mode === "enrich" && pageId ? "enrich-one" : mode); setMenu(false);
    try {
      const r = await api<{ pages?: AiTree[]; parentId?: string | null; updates?: { id: string; name: string; description: string }[]; links?: { pageId: string; specIds: string[] }[] }>(`/api/projects/${projectId}/ai/ia`, { method: "POST", json: { mode, pageId } });
      if (mode === "enrich") setProposal({ kind: "enrich", updates: (r.updates ?? []).map((u) => ({ ...u, checked: true })) });
      else if (mode === "link") {
        const links = (r.links ?? []).map((l) => ({ ...l, checked: true }));
        if (!links.length) { alert("연결할 만한 상세기능을 찾지 못했습니다."); return; }
        setProposal({ kind: "link", links });
      }
      else setProposal({ kind: "tree", parentId: r.parentId ?? null, pages: toProposed(r.pages ?? []) });
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }
  async function acceptProposal() {
    if (!proposal) return;
    setBusy("accept");
    try {
      if (proposal.kind === "tree") {
        await api(`/api/projects/${projectId}/pages`, { method: "POST", json: { bulk: toBulk(proposal.pages), parentId: proposal.parentId } });
      } else if (proposal.kind === "link") {
        // 기존 연결은 지우지 않고 합친다(수동으로 이어둔 것을 AI 제안이 덮어쓰지 않도록).
        for (const l of proposal.links.filter((x) => x.checked)) {
          const cur = pages.find((p) => p.id === l.pageId);
          if (!cur) continue;
          const merged = [...new Set([...cur.linkedSpecIds, ...l.specIds])];
          await api(`/api/projects/${projectId}/pages/${l.pageId}`, { method: "PATCH", json: { linkedSpecIds: merged } });
        }
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
              <button className={clsx("px-2.5 py-1 flex items-center gap-1", mode === "map" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setMode("map")}><LayoutGrid size={12} /> 맵</button>
              <button className={clsx("px-2.5 py-1 border-l flex items-center gap-1", mode === "table" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setMode("table")}><Table2 size={12} /> 표</button>
            </div>
            {mode === "map" && (
              <>
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button className={clsx("px-2.5 py-1", view === "detail" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setView("detail")}>상세히 보기</button>
                  <button className={clsx("px-2.5 py-1 border-l", view === "simple" ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")} onClick={() => setView("simple")}>간단히 보기</button>
                </div>
                <button className="btn btn-sm" disabled={!pages.length || busy !== null} onClick={autoArrange} title="저장된 위치를 지우고 계층 구조대로 다시 배치합니다">
                  {busy === "layout" ? <Spinner /> : <AlignHorizontalDistributeCenter size={13} />} 자동 정렬
                </button>
              </>
            )}
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
                    <button className="w-full text-left px-3 py-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] flex items-center gap-2 disabled:opacity-50" disabled={!pages.length} onClick={() => ai("link")}><Link2 size={14} className="text-muted" /><div><div>상세기능 연결</div><div className="text-[11px] text-muted">어느 화면에서 쓰이는지 자동 매칭 · 화면설계서에 반영</div></div></button>
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
            mode === "map" ? (
              <IaCanvas pages={pages} specs={specs} view={view} selectedId={selectedId} onSelect={setSelectedId} onReparent={reparent} onMove={movePages} />
            ) : (
              <IaTable pages={pages} selectedId={selectedId} onSelect={setSelectedId}
                onPatch={(id, patch) => patchPage(id, patch)}
                onPatchMeta={(id, meta) => patchPage(id, { meta })}
                onAddChild={(parentId) => createPage(parentId)}
                onDelete={removePage} />
            )
          )}
          {pages.length > 0 && mode === "map" && <div className="absolute bottom-3 left-3 text-[11px] text-muted bg-panel/80 rounded px-2 py-1 pointer-events-none">노드는 자유롭게 옮길 수 있고 위치가 저장됩니다. 아래 점에서 다른 페이지로 선을 이으면 하위 페이지가 되고, 선을 선택해 Delete 하면 최상위로 나옵니다.</div>}
        </div>
      </div>
      {proposal ? (
        <IaProposals proposal={proposal} pages={pages} specs={specs} onChange={setProposal} onAccept={acceptProposal} onReject={() => setProposal(null)} busy={busy === "accept"} />
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
