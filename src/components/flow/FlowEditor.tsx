"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, GitFork, MessageSquare, Plus, Trash2, Workflow } from "lucide-react";
import { api, debounce, readSse } from "@/lib/api";
import type { Flow } from "@/lib/types";
import type { FlowReadiness } from "@/lib/flow/readiness";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import { FlowCanvas } from "./FlowCanvas";
import { CreateFlowDialog } from "./CreateFlowDialog";
import { useDialog } from "@/components/ui/DialogProvider";

export function FlowEditor({ projectId, initialFlows, initialReadiness }: { projectId: string; initialFlows: Flow[]; initialReadiness: FlowReadiness }) {
  const { confirm, alert, prompt } = useDialog();
  const { tick, setSelection, mention } = useEditor();
  const [flows, setFlows] = useState<Flow[]>(initialFlows);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [activeId, setActiveId] = useState<string | null>(initialFlows[0]?.id ?? null);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [namedFor, setNamedFor] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const first = useRef(true);

  const active = flows.find((f) => f.id === activeId) ?? null;
  if (namedFor.id !== (active?.id ?? null) || namedFor.name !== (active?.name ?? "")) {
    setNamedFor({ id: active?.id ?? null, name: active?.name ?? "" });
    setName(active?.name ?? "");
  }

  const reload = useCallback(async () => {
    const [fs, r] = await Promise.all([api<Flow[]>(`/api/projects/${projectId}/flows`), api<FlowReadiness>(`/api/projects/${projectId}/ai/flow`)]);
    setFlows(fs); setReadiness(r);
    setActiveId((cur) => (cur && fs.some((f) => f.id === cur) ? cur : fs[0]?.id ?? null));
  }, [projectId]);
  useEffect(() => { if (first.current) { first.current = false; return; } reload(); }, [tick, reload]);

  const saveName = useRef(debounce((id: string, n: string) => {
    if (!n.trim()) return;
    api<Flow>(`/api/projects/${projectId}/flows/${id}`, { method: "PATCH", json: { name: n.trim() } }).then((f) => { setFlows((fs) => fs.map((x) => (x.id === id ? { ...x, name: f.name, updatedAt: f.updatedAt } : x))); broadcastChange(projectId); });
  }, 600)).current;

  /**
   * 스트리밍 생성 — 서버가 빈 플로우를 먼저 만들어 주면 바로 그 캔버스로 이동하고,
   * 이후 노드·엣지가 생길 때마다 전체 스냅샷을 받아 캔버스가 다시 시드된다(노드가 하나씩 생겨남).
   */
  async function streamFlow(json: Record<string, unknown>, busyKey: "generate" | "revise") {
    setBusy(busyKey);
    let opened = false;
    try {
      await readSse(`/api/projects/${projectId}/ai/flow/stream`, { method: "POST", json }, (event, data) => {
        if (event === "flow" || event === "done") {
          const f = (data as { flow: Flow }).flow;
          setFlows((fs) => (fs.some((x) => x.id === f.id) ? fs.map((x) => (x.id === f.id ? f : x)) : [f, ...fs]));
          if (!opened) { opened = true; setActiveId(f.id); setDialog(false); }
        } else if (event === "error") {
          throw new Error((data as { message?: string }).message ?? "생성 중 오류");
        }
      });
      broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); await reload(); }
    finally { setBusy(null); }
  }
  function generate(n: string, request: string) { return streamFlow({ mode: "new", name: n || undefined, request }, "generate"); }
  async function createBlank(n: string) {
    setBusy("blank");
    try {
      const f = await api<Flow>(`/api/projects/${projectId}/flows`, { method: "POST", json: { name: n, nodes: [{ id: "start", type: "start", label: "시작", description: "", position: { x: 40, y: 120 } }], edges: [] } });
      setFlows((fs) => [f, ...fs]); setActiveId(f.id); setDialog(false); broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }
  async function revise() {
    if (!active) return;
    const request = await prompt({ title: "수정본 생성", message: "수정본에 반영할 요청 사항 (선택)", defaultValue: active.request, confirmLabel: "생성" });
    if (request === null) return;
    await streamFlow({ mode: "revise", flowId: active.id, request }, "revise");
  }
  async function remove() {
    if (!active || !(await confirm({ message: `"${active.name}" 유저플로우를 삭제할까요?`, confirmLabel: "삭제", danger: true }))) return;
    await api(`/api/projects/${projectId}/flows/${active.id}`, { method: "DELETE" });
    setFlows((fs) => fs.filter((f) => f.id !== active.id)); setActiveId(null); setSelection(null); broadcastChange(projectId);
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-60 shrink-0 border-r bg-panel flex flex-col min-h-0">
        <div className="px-3 py-2 text-[11px] font-medium text-muted border-b flex items-center justify-between">유저플로우 <span className="text-muted/70">{flows.length}</span></div>
        <div className="flex-1 overflow-y-auto py-1">
          {flows.length === 0 && <div className="text-xs text-muted px-3 py-6 text-center">아직 유저플로우가 없습니다.</div>}
          {flows.map((f) => (
            <button key={f.id} onClick={() => { setActiveId(f.id); setSelection({ type: "flow", id: f.id, label: f.name }); }}
              className={clsx("w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px]", activeId === f.id ? "bg-accent-soft text-accent" : "hover:bg-black/[.03] dark:hover:bg-white/[.04]")}>
              <Workflow size={13} className="shrink-0 text-muted" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-[10px] text-muted">{f.nodes.length}</span>
            </button>
          ))}
        </div>
        <div className="border-t p-2">
          <button className="btn btn-sm btn-primary w-full justify-center" onClick={() => setDialog(true)}><Plus size={13} /> 새 유저플로우</button>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <>
            <div className="h-11 border-b bg-panel flex items-center px-3 gap-2 shrink-0">
              <input className="font-medium bg-transparent outline-none rounded px-2 py-1 hover:bg-black/[.03] focus:bg-black/[.04] w-72 truncate text-sm" value={name}
                onChange={(e) => { setName(e.target.value); saveName(active.id, e.target.value); }} />
              {active.request && <span className="text-[11px] text-muted truncate max-w-[280px]" title={active.request}>요청: {active.request}</span>}
              <div className="ml-auto flex items-center gap-1">
                <button className="btn btn-sm btn-ghost" title="매니에게 질문" onClick={() => mention({ type: "flow", id: active.id, label: active.name })}><MessageSquare size={13} /> 매니에게 질문</button>
                <button className="btn btn-sm" disabled={busy !== null || !readiness.ready} title={readiness.ready ? "매니가 이 플로우의 개선본을 새 플로우로 만듭니다" : "PRD 한 줄 정의와 기능 1개 이상이 필요합니다"} onClick={revise}>
                  {busy === "revise" ? <Spinner /> : <GitFork size={13} />} 수정본 만들기
                </button>
                <button className="btn btn-sm btn-ghost text-danger" onClick={remove}><Trash2 size={13} /></button>
              </div>
            </div>
            <FlowCanvas projectId={projectId} flow={active} onSaved={(f) => setFlows((fs) => fs.map((x) => (x.id === f.id ? f : x)))} />
            {(busy === "generate" || busy === "revise") && active.nodes.length <= 1 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="card px-4 py-3 text-sm text-center shadow-lg flex items-center gap-3">
                  <Spinner />
                  <div>
                    <div>매니가 사용자 여정을 구상하는 중</div>
                    <div className="text-[11px] text-muted">프레임이 먼저 잡히고, 노드가 하나씩 이 자리에 그려집니다. 보통 30~60초 뒤 시작해요.</div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-muted">
              <Copy size={28} className="mx-auto mb-3 text-muted/50" />
              <div className="mb-3">유저플로우를 선택하거나 새로 만드세요.</div>
              <button className="btn btn-sm btn-primary" onClick={() => setDialog(true)}><Plus size={13} /> 새 유저플로우</button>
            </div>
          </div>
        )}
      </div>
      {dialog && <CreateFlowDialog projectId={projectId} readiness={readiness} busy={busy !== null} onGenerate={generate} onCreateBlank={createBlank} onClose={() => setDialog(false)} />}
    </div>
  );
}
