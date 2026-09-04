"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Monitor, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import type { Device, FlowNode } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui";
import type { FlowLite, WfSummary } from "./WireframeTab";

/** Order page nodes roughly along the flow (BFS from start nodes), then any leftovers. */
function orderedPageNodes(f: FlowLite): FlowNode[] {
  const out: FlowNode[] = []; const seen = new Set<string>();
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  const nextOf = (id: string) => f.edges.filter((e) => e.source === id).map((e) => e.target);
  const hasIncoming = new Set(f.edges.map((e) => e.target));
  const queue = f.nodes.filter((n) => n.type === "start" || !hasIncoming.has(n.id)).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue; seen.add(id);
    const n = byId.get(id); if (!n) continue;
    if (n.type === "page") out.push(n);
    queue.push(...nextOf(id));
  }
  for (const n of f.nodes) if (n.type === "page" && !seen.has(n.id)) out.push(n);
  return out;
}

export function NewWireframeDialog({ projectId, initialFlows, onClose, onCreated }: { projectId: string; initialFlows: FlowLite[]; onClose: () => void; onCreated: (wf: WfSummary) => void }) {
  const [flows, setFlows] = useState<FlowLite[]>(initialFlows);
  const [flowId, setFlowId] = useState<string>(initialFlows[0]?.id ?? "");
  const [device, setDevice] = useState<Device>("desktop");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialFlows[0] ? orderedPageNodes(initialFlows[0]).map((n) => n.id) : []));
  function chooseFlow(id: string, list: FlowLite[] = flows) {
    setFlowId(id);
    const f = list.find((x) => x.id === id);
    setPicked(new Set(f ? orderedPageNodes(f).map((n) => n.id) : []));
  }
  const [request, setRequest] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // refresh flows from the flows API when available
  useEffect(() => {
    api<unknown>(`/api/projects/${projectId}/flows`).then((r) => {
      const arr = Array.isArray(r) ? (r as FlowLite[]) : Array.isArray((r as { flows?: FlowLite[] })?.flows) ? (r as { flows: FlowLite[] }).flows : null;
      if (arr && arr.length) { setFlows(arr); chooseFlow(arr.some((f) => f.id === flowId) ? flowId : arr[0].id, arr); }
    }).catch(() => { /* flows API not available yet; use server-provided list */ });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flow = flows.find((f) => f.id === flowId);
  const pageNodes = useMemo(() => (flow ? orderedPageNodes(flow) : []), [flow]);

  const allPicked = pageNodes.length > 0 && pageNodes.every((n) => picked.has(n.id));
  function toggle(id: string) { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function submit() {
    if (!flow || !picked.size) return;
    setBusy(true); setError(null);
    try {
      const wf = await api<WfSummary>(`/api/projects/${projectId}/wireframes`, { method: "POST", json: { flowId, device, nodeIds: pageNodes.filter((n) => picked.has(n.id)).map((n) => n.id), request, name: name.trim() || undefined } });
      onCreated(wf);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <Dialog title="새 와이어프레임" onClose={onClose} wide footer={
      <>
        <button className="btn" onClick={onClose} disabled={busy}>취소</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !flow || picked.size === 0}>{busy ? <Spinner /> : null} {picked.size}개 페이지 생성</button>
      </>
    }>
      {!flows.length ? (
        <div className="text-sm text-muted py-6 text-center">
          와이어프레임은 유저플로우의 페이지를 기준으로 생성됩니다.<br />
          먼저 <Link className="text-accent underline" href={`/p/${projectId}/flow`}>유저플로우</Link> 탭에서 플로우를 만들어 주세요.
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <div className="text-xs font-medium text-muted mb-1.5">1. 유저플로우</div>
            <select className="input" value={flowId} onChange={(e) => chooseFlow(e.target.value)}>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.nodes.filter((n) => n.type === "page").length}개 페이지)</option>)}
            </select>
          </section>
          <section>
            <div className="text-xs font-medium text-muted mb-1.5">2. 기기</div>
            <div className="grid grid-cols-2 gap-2">
              {([["desktop", "데스크톱", Monitor, "1280px 기준"], ["mobile", "모바일", Smartphone, "390px 기준"]] as const).map(([k, label, Icon, hint]) => (
                <button key={k} type="button" onClick={() => setDevice(k)} className={clsx("card px-3 py-2.5 text-left flex items-center gap-3 hover:bg-black/[.02]", device === k && "border-accent bg-accent-soft/40")}>
                  <Icon size={18} className={device === k ? "text-accent" : "text-muted"} />
                  <div><div className="text-sm font-medium">{label}</div><div className="text-[11px] text-muted">{hint}</div></div>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium text-muted">3. 생성할 페이지 ({picked.size}/{pageNodes.length})</div>
              <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(pageNodes.map((n) => n.id)))} /> 전체 선택
              </label>
            </div>
            {!pageNodes.length ? (
              <div className="text-xs text-muted border rounded-md border-dashed p-3">이 플로우에는 페이지 노드가 없습니다. 유저플로우 탭에서 페이지 노드를 추가해 주세요.</div>
            ) : (
              <div className="card divide-y max-h-64 overflow-y-auto">
                {pageNodes.map((n, i) => (
                  <label key={n.id} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-black/[.02]">
                    <input type="checkbox" className="mt-1" checked={picked.has(n.id)} onChange={() => toggle(n.id)} />
                    <div className="min-w-0">
                      <div className="text-sm"><span className="text-muted text-xs mr-1.5">{i + 1}</span>{n.label || "(이름 없음)"}</div>
                      {n.description && <div className="text-[11px] text-muted truncate">{n.description}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>
          <section>
            <div className="text-xs font-medium text-muted mb-1.5">4. 추가 요청사항 (선택)</div>
            <textarea className="input min-h-[72px]" placeholder="예: 하단 탭바 4개, 카드형 리스트, 관리자 메뉴는 제외" value={request} onChange={(e) => setRequest(e.target.value)} />
            <input className="input mt-2" placeholder={`이름 (기본: ${flow?.name ?? ""} · ${device === "mobile" ? "모바일" : "데스크톱"})`} value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          {error && <div className="text-xs text-danger">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}
