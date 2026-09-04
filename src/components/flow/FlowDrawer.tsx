"use client";
import { useState } from "react";
import { MessageSquare, Trash2, X } from "lucide-react";
import { FLOW_NODE_LABEL, FLOW_NODE_TYPES, type FlowEdge, type FlowNode, type FlowNodeType } from "@/lib/types";

export function NodeDrawer({ node, onChange, onDelete, onAsk, onClose }: { node: FlowNode; onChange: (patch: Partial<Pick<FlowNode, "label" | "description" | "type">>) => void; onDelete: () => void; onAsk: () => void; onClose: () => void }) {
  const [synced, setSynced] = useState<{ id: string; label: string; description: string }>({ id: node.id, label: node.label, description: node.description });
  const [label, setLabel] = useState(node.label);
  const [desc, setDesc] = useState(node.description);
  if (synced.id !== node.id || synced.label !== node.label || synced.description !== node.description) {
    setSynced({ id: node.id, label: node.label, description: node.description });
    setLabel(node.label); setDesc(node.description);
  }
  return (
    <div className="w-80 shrink-0 border-l bg-panel flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <div className="text-xs text-muted flex-1">노드 편집 · {FLOW_NODE_LABEL[node.type]}</div>
        <button className="btn btn-icon text-muted" title="매니에게 질문" onClick={onAsk}><MessageSquare size={14} /></button>
        <button className="btn btn-icon text-muted" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="text-[11px] font-medium text-muted">유형</label>
          <div className="grid grid-cols-5 gap-1 mt-1">
            {FLOW_NODE_TYPES.map((t) => (
              <button key={t} className={`btn btn-sm justify-center ${node.type === t ? "btn-primary" : ""}`} onClick={() => onChange({ type: t as FlowNodeType })}>{FLOW_NODE_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted">라벨</label>
          <input className="input mt-1" value={label} onChange={(e) => { setLabel(e.target.value); onChange({ label: e.target.value }); }} />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted">설명</label>
          <textarea className="input mt-1 min-h-[100px] resize-y" value={desc} placeholder="이 단계에서 일어나는 일" onChange={(e) => { setDesc(e.target.value); onChange({ description: e.target.value }); }} />
        </div>
        <p className="text-[11px] text-muted">노드를 선택하고 Delete 키를 누르면 삭제됩니다. 노드 오른쪽 점을 드래그해 다른 노드에 연결하세요.</p>
      </div>
      <div className="border-t p-3">
        <button className="btn btn-sm btn-ghost text-danger w-full justify-start" onClick={onDelete}><Trash2 size={13} /> 노드 삭제</button>
      </div>
    </div>
  );
}

export function EdgeDrawer({ edge, nodes, onChange, onDelete, onClose }: { edge: FlowEdge; nodes: FlowNode[]; onChange: (label: string) => void; onDelete: () => void; onClose: () => void }) {
  const [synced, setSynced] = useState<{ id: string; label: string }>({ id: edge.id, label: edge.label ?? "" });
  const [label, setLabel] = useState(edge.label ?? "");
  if (synced.id !== edge.id || synced.label !== (edge.label ?? "")) {
    setSynced({ id: edge.id, label: edge.label ?? "" });
    setLabel(edge.label ?? "");
  }
  const s = nodes.find((n) => n.id === edge.source)?.label ?? "?";
  const t = nodes.find((n) => n.id === edge.target)?.label ?? "?";
  return (
    <div className="w-80 shrink-0 border-l bg-panel flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <div className="text-xs text-muted flex-1 truncate">연결 편집 · {s} → {t}</div>
        <button className="btn btn-icon text-muted" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="flex-1 px-4 py-3 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted">라벨 (분기 조건 등)</label>
          <input autoFocus className="input mt-1" value={label} placeholder="예: 예 / 아니오 / 로그인 성공" onChange={(e) => { setLabel(e.target.value); onChange(e.target.value); }} />
        </div>
        <div className="flex flex-wrap gap-1">
          {["예", "아니오", "성공", "실패", "취소"].map((c) => <button key={c} className="chip hover:bg-accent-soft" onClick={() => { setLabel(c); onChange(c); }}>{c}</button>)}
        </div>
      </div>
      <div className="border-t p-3">
        <button className="btn btn-sm btn-ghost text-danger w-full justify-start" onClick={onDelete}><Trash2 size={13} /> 연결 삭제</button>
      </div>
    </div>
  );
}
