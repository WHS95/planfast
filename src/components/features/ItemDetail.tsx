"use client";
import { useState } from "react";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, MessageSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { CHILD_ITEM_TYPE, ITEM_TYPE_LABEL, SPEC_SLOTS, SPEC_SLOT_LABEL, rid, type FeatureData, type Item, type RequirementData, type SpecData, type SpecSlot } from "@/lib/types";
import { useEditor } from "@/components/editor/EditorContext";
import { PrioritySelect, Spinner, StatusSelect } from "@/components/ui";
import { useFeatures } from "./FeaturesContext";
import { TYPE_CLASS } from "./utils";

/** Full editor for one item. Used by the tree-view drawer and the directory-view right pane. */
export function ItemDetail({ item, onPrev, onNext, onClose }: { item: Item; onPrev?: () => void; onNext?: () => void; onClose?: () => void }) {
  const { store, addChild, removeItem, aiGenerate, projectId } = useFeatures();
  const { mention } = useEditor();
  const childType = CHILD_ITEM_TYPE[item.type];
  const set = (patch: Parameters<typeof store.update>[1]) => store.update(item.id, patch);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
        <span className={clsx("chip border-transparent", TYPE_CLASS[item.type])}>{ITEM_TYPE_LABEL[item.type]}</span>
        <span className="text-[11px] text-muted ml-1">{store.saving ? "저장 중…" : "저장됨"}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {onPrev && <button className="btn btn-icon" title="이전 항목" onClick={onPrev}><ChevronLeft size={14} /></button>}
          {onNext && <button className="btn btn-icon" title="다음 항목" onClick={onNext}><ChevronRight size={14} /></button>}
          <button className="btn btn-icon text-muted" title="매니에게 질문" onClick={() => mention({ type: "item", id: item.id, label: item.title || ITEM_TYPE_LABEL[item.type] })}><MessageSquare size={14} /></button>
          <button className="btn btn-icon text-muted hover:text-danger" title="삭제" onClick={() => { if (confirm(`'${item.title || "(제목 없음)"}' 항목과 하위 항목을 모두 삭제할까요?`)) void removeItem(item.id); }}><Trash2 size={14} /></button>
          {onClose && <button className="btn btn-icon" title="닫기" onClick={onClose}><X size={14} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <input className="field font-semibold text-base" placeholder={`${ITEM_TYPE_LABEL[item.type]} 제목`} value={item.title} onChange={(e) => set({ title: e.target.value })} />
          <textarea className="field text-sm text-muted mt-1" placeholder="설명을 입력하세요" rows={2} value={item.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted">상태</label>
          <StatusSelect value={item.status} onChange={(status) => set({ status })} />
          <label className="text-xs text-muted ml-2">중요도</label>
          <PrioritySelect value={item.priority} onChange={(priority) => set({ priority })} />
        </div>

        {item.type === "requirement" && <AcceptanceEditor data={item.data as RequirementData} onChange={(data) => set({ data })} />}
        {item.type === "feature" && <FeatureEditor data={item.data as FeatureData} onChange={(data) => set({ data })} />}
        {item.type === "spec" && <SlotsEditor projectId={projectId} item={item} data={item.data as SpecData} onChange={(data) => set({ data })} />}

        {childType && (
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs font-medium text-muted">하위 {ITEM_TYPE_LABEL[childType]} ({store.children(item.id).length})</div>
            <ul className="space-y-1">
              {store.children(item.id).map((c) => <ChildRow key={c.id} item={c} />)}
            </ul>
            <div className="flex gap-1">
              <button className="btn btn-sm" onClick={() => void addChild(item.id)}><Plus size={12} /> {ITEM_TYPE_LABEL[childType]} 추가</button>
              <button className="btn btn-sm" onClick={() => aiGenerate(item.id)}><Sparkles size={12} /> 매니로 하위 생성</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChildRow({ item }: { item: Item }) {
  const { select } = useFeatures();
  return (
    <li>
      <button className="w-full text-left text-sm px-2 py-1 rounded-md hover:bg-black/[.04] dark:hover:bg-white/[.06] truncate" onClick={() => select(item.id)}>
        {item.title || <span className="text-muted">(제목 없음)</span>}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- requirement
function AcceptanceEditor({ data, onChange }: { data: RequirementData; onChange: (d: RequirementData) => void }) {
  const list = data.acceptance ?? [];
  const setList = (acceptance: RequirementData["acceptance"]) => onChange({ ...data, acceptance });
  return (
    <div>
      <div className="text-xs font-medium text-muted mb-1">수용 기준</div>
      <ul className="space-y-1">
        {list.map((a) => (
          <li key={a.id} className="flex items-start gap-2 group">
            <input type="checkbox" className="mt-1.5" checked={a.done} onChange={(e) => setList(list.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)))} />
            <textarea className={clsx("field text-sm flex-1", a.done && "line-through text-muted")} rows={1} value={a.text} placeholder="검증 가능한 기준을 입력" onChange={(e) => setList(list.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)))} />
            <button className="btn btn-icon text-muted opacity-0 group-hover:opacity-100" onClick={() => setList(list.filter((x) => x.id !== a.id))}><X size={12} /></button>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost btn-sm text-muted mt-1" onClick={() => setList([...list, { id: rid(), text: "", done: false }])}><Plus size={12} /> 기준 추가</button>
    </div>
  );
}

// ---------------------------------------------------------------- feature
function FeatureEditor({ data, onChange }: { data: FeatureData; onChange: (d: FeatureData) => void }) {
  const [chip, setChip] = useState("");
  const roles = data.roles ?? [];
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-muted mb-1">사용자 역할</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {roles.map((r, i) => (
            <span key={i} className="chip bg-accent-soft text-accent border-transparent">{r}<button onClick={() => onChange({ ...data, roles: roles.filter((_, j) => j !== i) })}><X size={11} /></button></span>
          ))}
          <input className="text-sm bg-transparent outline-none min-w-[120px]" placeholder="역할 입력 후 Enter" value={chip} onChange={(e) => setChip(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chip.trim()) { onChange({ ...data, roles: [...roles, chip.trim()] }); setChip(""); } }} />
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted mb-1">근거</div>
        <textarea className="field text-sm" rows={2} placeholder="이 기능이 왜 필요한가요?" value={data.rationale ?? ""} onChange={(e) => onChange({ ...data, rationale: e.target.value })} />
      </div>
      <div>
        <div className="text-xs font-medium text-muted mb-1">성공 기준</div>
        <textarea className="field text-sm" rows={2} placeholder="측정 가능한 성공 기준" value={data.successCriteria ?? ""} onChange={(e) => onChange({ ...data, successCriteria: e.target.value })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spec slots
export function SlotsEditor({ projectId, item, data, onChange, compact }: { projectId: string; item: Item; data: SpecData; onChange: (d: SpecData) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Partial<Record<SpecSlot, string>>>({});
  const hidden = new Set(data.hiddenSlots ?? []);
  const slots = data.slots ?? {};
  const setSlot = (s: SpecSlot, v: string) => onChange({ ...data, slots: { ...slots, [s]: v } });
  const toggleHide = (s: SpecSlot) => onChange({ ...data, hiddenSlots: hidden.has(s) ? [...hidden].filter((x) => x !== s) : [...hidden, s] });

  async function aiFill() {
    setBusy(true);
    try {
      const r = await api<{ slots: Record<SpecSlot, string> }>(`/api/projects/${projectId}/ai/slots`, { method: "POST", json: { itemId: item.id } });
      const next: Partial<Record<SpecSlot, string>> = {};
      for (const s of SPEC_SLOTS) if (r.slots[s]?.trim() && r.slots[s] !== slots[s]) next[s] = r.slots[s];
      setProposal(next);
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  const accept = (s: SpecSlot) => { const v = proposal[s]; if (v === undefined) return; setSlot(s, v); setProposal((p) => { const n = { ...p }; delete n[s]; return n; }); };
  const reject = (s: SpecSlot) => setProposal((p) => { const n = { ...p }; delete n[s]; return n; });
  const acceptAll = () => {
    const nextSlots = { ...slots };
    for (const s of SPEC_SLOTS) if (proposal[s] !== undefined) nextSlots[s] = proposal[s];
    onChange({ ...data, slots: nextSlots });
    setProposal({});
  };
  const pendingCount = Object.keys(proposal).length;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <div className="text-xs font-medium text-muted">개발 준비 슬롯</div>
        <div className="ml-auto flex gap-1">
          {pendingCount > 0 && (
            <>
              <button className="btn btn-sm" onClick={acceptAll}><Check size={12} /> 모두 반영 ({pendingCount})</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setProposal({})}><X size={12} /> 모두 거절</button>
            </>
          )}
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={aiFill}>{busy ? <Spinner className="w-3 h-3" /> : <Sparkles size={12} />} 매니로 슬롯 자동 작성</button>
        </div>
      </div>
      <div className={clsx(compact ? "space-y-2" : "space-y-3")}>
        {SPEC_SLOTS.filter((s) => !hidden.has(s)).map((s) => (
          <div key={s} className="group">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs font-medium">{SPEC_SLOT_LABEL[s]}</span>
              <button className="btn btn-icon text-muted opacity-0 group-hover:opacity-100 !p-1" title="슬롯 숨기기" onClick={() => toggleHide(s)}><EyeOff size={12} /></button>
            </div>
            <textarea className="field text-sm" rows={compact ? 1 : 2} placeholder={`${SPEC_SLOT_LABEL[s]} 내용`} value={slots[s] ?? ""} onChange={(e) => setSlot(s, e.target.value)} />
            {proposal[s] !== undefined && (
              <div className="mt-1 rounded-md border border-accent/40 bg-accent-soft/50 p-2 text-sm">
                <div className="text-[11px] font-medium text-accent mb-1 flex items-center gap-1"><Sparkles size={11} /> 매니 제안</div>
                <div className="whitespace-pre-wrap">{proposal[s]}</div>
                <div className="flex gap-1 mt-2">
                  <button className="btn btn-sm btn-primary" onClick={() => accept(s)}><Check size={12} /> 반영</button>
                  <button className="btn btn-sm" onClick={() => reject(s)}><X size={12} /> 거절</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {hidden.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted">숨긴 슬롯:</span>
          {[...hidden].map((s) => (
            <button key={s} className="chip text-muted hover:text-fg" title="슬롯 보이기" onClick={() => toggleHide(s)}><Eye size={11} /> {SPEC_SLOT_LABEL[s]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
