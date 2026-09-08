"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { Flow, Wireframe, WireframePage } from "@/lib/types";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Empty } from "@/components/ui";
import { NewWireframeDialog } from "./NewWireframeDialog";
import { WireframeViewer } from "./WireframeViewer";
import { useDialog } from "@/components/ui/DialogProvider";

export type WfSummary = Wireframe & { running: boolean; pages: WireframePage[] };
export type FlowLite = Pick<Flow, "id" | "name" | "nodes" | "edges">;

export function WireframeTab({ projectId, initialWireframes, initialFlows }: { projectId: string; initialWireframes: WfSummary[]; initialFlows: FlowLite[] }) {
  const { confirm, alert, prompt } = useDialog();
  const { tick } = useEditor();
  const [list, setList] = useState<WfSummary[]>(initialWireframes);
  const [selectedId, setSelectedId] = useState<string | null>(initialWireframes[0]?.id ?? null);
  const [detail, setDetail] = useState<WfSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const first = useRef(true);

  const reloadList = useCallback(async () => {
    const l = await api<WfSummary[]>(`/api/projects/${projectId}/wireframes`);
    setList(l);
    setSelectedId((cur) => (cur && l.some((w) => w.id === cur) ? cur : l[0]?.id ?? null));
  }, [projectId]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    api<WfSummary[]>(`/api/projects/${projectId}/wireframes`).then((l) => {
      setList(l);
      setSelectedId((cur) => (cur && l.some((w) => w.id === cur) ? cur : l[0]?.id ?? null));
    }).catch(() => {});
  }, [tick, projectId]);

  /** set detail and mirror its page statuses into the list summary */
  const applyDetail = useCallback((d: WfSummary | null) => {
    setDetail(d);
    if (d) setList((l) => l.map((w) => (w.id === d.id ? { ...d, pages: d.pages.map((p) => ({ ...p, html: "" })) } : w)));
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    try { applyDetail(await api<WfSummary>(`/api/projects/${projectId}/wireframes/${id}`)); } catch { applyDetail(null); }
  }, [projectId, applyDetail]);
  useEffect(() => {
    (async () => { if (selectedId) await loadDetail(selectedId); else applyDetail(null); })();
  }, [selectedId, loadDetail, applyDetail]);

  // poll while generating
  const busy = !!detail && (detail.running || detail.pages.some((p) => p.status === "pending" || p.status === "generating"));
  useEffect(() => {
    if (!busy || !selectedId) return;
    const t = setInterval(() => loadDetail(selectedId), 2000);
    return () => clearInterval(t);
  }, [busy, selectedId, loadDetail]);

  async function rename() {
    if (!detail) return;
    const name = (await prompt({ title: "이름 변경", message: "와이어프레임 이름", defaultValue: detail.name, confirmLabel: "변경" }))?.trim();
    if (!name || name === detail.name) return;
    await api(`/api/projects/${projectId}/wireframes/${detail.id}`, { method: "PATCH", json: { name } });
    await loadDetail(detail.id); broadcastChange(projectId);
  }
  async function remove() {
    if (!detail || !(await confirm({ message: `"${detail.name}" 와이어프레임을 삭제할까요?\n페이지도 모두 삭제됩니다.`, confirmLabel: "삭제", danger: true }))) return;
    try { await api(`/api/projects/${projectId}/wireframes/${detail.id}`, { method: "DELETE" }); } catch (e) { alert((e as Error).message); return; }
    await reloadList(); broadcastChange(projectId);
  }

  const doneCount = detail?.pages.filter((p) => p.status === "done").length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-11 border-b bg-panel flex items-center gap-2 px-3 shrink-0">
        {list.length > 0 && (
          <div className="relative">
            <button className="btn btn-sm" onClick={() => setMenu((m) => !m)}>
              <span className="max-w-[260px] truncate">{detail?.name ?? list.find((w) => w.id === selectedId)?.name ?? "와이어프레임 선택"}</span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="absolute left-0 top-full mt-1 z-20 card shadow-lg min-w-[260px] py-1" onMouseLeave={() => setMenu(false)}>
                {list.map((w) => (
                  <button key={w.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/[.04] flex items-center gap-2" onClick={() => { setSelectedId(w.id); setMenu(false); }}>
                    <span className="truncate flex-1">{w.name}</span>
                    <span className="text-[11px] text-muted shrink-0">{w.device === "mobile" ? "모바일" : "데스크톱"} · {w.pages.length}p</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {detail && (
          <>
            <button className="btn btn-icon text-muted" title="이름 변경" onClick={rename}><Pencil size={14} /></button>
            <button className="btn btn-icon text-muted" title="삭제" onClick={remove}><Trash2 size={14} /></button>
            <span className="text-xs text-muted ml-1">{busy ? `생성 중 ${doneCount}/${detail.pages.length}` : `생성됨 ${doneCount}/${detail.pages.length}`}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> 새 와이어프레임</button>
        </div>
      </div>

      {!list.length ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full">
            <Empty>
              <div className="mb-3">아직 와이어프레임이 없습니다.<br />유저플로우의 페이지를 골라 화면 초안을 생성해 보세요.</div>
              <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> 새 와이어프레임</button>
            </Empty>
          </div>
        </div>
      ) : detail ? (
        <WireframeViewer projectId={projectId} wf={detail} onChange={applyDetail} onReload={() => loadDetail(detail.id)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">불러오는 중…</div>
      )}

      {creating && (
        <NewWireframeDialog
          projectId={projectId}
          initialFlows={initialFlows}
          onClose={() => setCreating(false)}
          onCreated={async (wf) => { setCreating(false); await reloadList(); setSelectedId(wf.id); broadcastChange(projectId); }}
        />
      )}
    </div>
  );
}
