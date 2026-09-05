"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, MessageSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { CHILD_ITEM_TYPE, ITEM_TYPE_LABEL, SPEC_SLOTS, SPEC_SLOT_LABEL, rid, type FeatureData, type Item, type RequirementData, type SpecData, type SpecSlot } from "@/lib/types";
import { useEditor } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import { useFeatures } from "./FeaturesContext";
import { CommentBox } from "./CommentBox";
import { NewBadge, NumTag, PriorityBarsSelect, StatusChipSelect } from "./controls";
import { TYPE_CLASS, tint } from "./utils";

/** textarea that grows with its content */
function AutoTextarea({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void; className?: string } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} className={clsx("field resize-none overflow-hidden", className)} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

/**
 * Sliding right drawer (420px). Mount inside an `<AnimatePresence>` so the exit plays;
 * keep the key stable across items so switching selection does not re-run the slide.
 */
export function ItemDrawer(props: { item: Item; onPrev?: () => void; onNext?: () => void; onClose: () => void }) {
  return (
    <motion.aside
      className="absolute right-0 top-0 bottom-0 w-[420px] max-w-full z-20 flex flex-col bg-panel border-l"
      style={{ boxShadow: "var(--shadow-3)" }}
      initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 28, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <ItemDetail {...props} />
    </motion.aside>
  );
}

/** Full editor for one item. Used by the tree-view drawer and the directory-view drawer. */
export function ItemDetail({ item, onPrev, onNext, onClose }: { item: Item; onPrev?: () => void; onNext?: () => void; onClose?: () => void }) {
  const { store, addChild, removeItem, aiGenerate, aiBusy, aiBusyParentId, resolveProposals, projectId, colors, numbers } = useFeatures();
  const { mention } = useEditor();
  const childType = CHILD_ITEM_TYPE[item.type];
  const color = colors.get(item.id) ?? "var(--accent)";
  const num = numbers.get(item.id);
  const set = (patch: Parameters<typeof store.update>[1]) => store.update(item.id, patch);
  const busyHere = aiBusy && aiBusyParentId === item.id;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-1 px-3 h-12 border-b shrink-0" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
        <span className={clsx("chip border-transparent", TYPE_CLASS[item.type])}>{ITEM_TYPE_LABEL[item.type]}</span>
        {num && <NumTag n={num} />}
        {item.aiProposed && <NewBadge />}
        <div className="ml-auto flex items-center gap-0.5">
          {onPrev && <button className="btn btn-icon" title="이전 항목" onClick={onPrev}><ChevronLeft size={14} /></button>}
          {onNext && <button className="btn btn-icon" title="다음 항목" onClick={onNext}><ChevronRight size={14} /></button>}
          {item.aiProposed ? (
            <>
              <button className="btn btn-sm btn-ghost text-muted hover:text-danger" title="이 제안을 삭제합니다" onClick={() => void resolveProposals("reject", [item.id])}><X size={13} /> 거절</button>
              <button className="btn btn-sm btn-primary" title="제안을 확정합니다" onClick={() => void resolveProposals("approve", [item.id])}><Check size={13} /> 승인</button>
            </>
          ) : (
            <>
              <button className="btn btn-icon text-muted" title="매니에게 질문" onClick={() => mention({ type: "item", id: item.id, label: item.title || ITEM_TYPE_LABEL[item.type] })}><MessageSquare size={14} /></button>
              <button className="btn btn-icon text-muted hover:text-danger" title="삭제" onClick={() => { if (confirm(`'${item.title || "(제목 없음)"}' 항목과 하위 항목을 모두 삭제할까요?`)) void removeItem(item.id); }}><Trash2 size={14} /></button>
            </>
          )}
          {onClose && <button className="btn btn-icon" title="닫기" onClick={onClose}><X size={14} /></button>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
        <div>
          <input className="field font-semibold text-[15px]" placeholder={`${ITEM_TYPE_LABEL[item.type]} 제목`} value={item.title} onChange={(e) => set({ title: e.target.value })} />
          <div className="flex items-center gap-2 mt-1 px-0.5">
            <span className="font-mono text-[11px] text-muted select-all" title="항목 ID">{item.id}</span>
            <span className="text-[11px] text-muted ml-auto">{store.saving ? "저장 중…" : "저장됨"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <StatusChipSelect value={item.status} onChange={(status) => set({ status })} />
          <PriorityBarsSelect value={item.priority} onChange={(priority) => set({ priority })} />
        </div>

        <div>
          <div className="text-xs font-medium text-muted mb-0.5">설명</div>
          <AutoTextarea className="text-sm" placeholder="설명을 입력하세요" value={item.description} onChange={(description) => set({ description })} />
        </div>

        {item.type === "requirement" && <AcceptanceEditor data={item.data as RequirementData} color={color} onChange={(data) => set({ data })} />}
        {item.type === "feature" && <FeatureEditor data={item.data as FeatureData} onChange={(data) => set({ data })} />}
        {item.type === "spec" && <SlotsEditor projectId={projectId} item={item} data={item.data as SpecData} onChange={(data) => set({ data })} />}

        {childType && (
          <div className="pt-3 border-t space-y-2">
            <div className="text-xs font-medium text-muted">하위 {ITEM_TYPE_LABEL[childType]} ({store.children(item.id).length})</div>
            <ul className="space-y-0.5">
              {store.children(item.id).map((c) => <ChildRow key={c.id} item={c} />)}
            </ul>
            <div className="flex gap-1">
              <button className="btn btn-sm" onClick={() => void addChild(item.id)}><Plus size={12} /> {ITEM_TYPE_LABEL[childType]} 추가</button>
              <button className="btn btn-sm" disabled={aiBusy} onClick={() => aiGenerate(item.id)}>{busyHere ? <Spinner className="w-3 h-3" /> : <Sparkles size={12} />} 매니로 하위 생성</button>
            </div>
          </div>
        )}

        <CommentBox projectId={projectId} itemId={item.id} />
      </div>
    </div>
  );
}

function ChildRow({ item }: { item: Item }) {
  const { select, numbers, colors } = useFeatures();
  return (
    <li>
      <button className="w-full text-left text-sm px-2 py-1 rounded-md hover:bg-black/[.04] dark:hover:bg-white/[.06] flex items-center gap-1.5" onClick={() => select(item.id)}>
        <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: colors.get(item.id) ?? "var(--line)" }} />
        {numbers.get(item.id) && <NumTag n={numbers.get(item.id)!} />}
        <span className="truncate flex-1">{item.title || <span className="text-muted">(제목 없음)</span>}</span>
        {item.aiProposed && <NewBadge />}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- requirement
function AcceptanceEditor({ data, color, onChange }: { data: RequirementData; color: string; onChange: (d: RequirementData) => void }) {
  const list = data.acceptance ?? [];
  const setList = (acceptance: RequirementData["acceptance"]) => onChange({ ...data, acceptance });
  return (
    <div>
      <div className="text-xs font-medium text-muted mb-1.5">수용 기준 ({list.filter((a) => a.done).length}/{list.length})</div>
      <ul className="space-y-1.5">
        {list.map((a) => (
          <li key={a.id} className={clsx("group rounded-lg border px-2.5 py-2 flex items-start gap-2 transition-colors")}
            style={a.done ? { borderColor: tint(color, 45, "var(--line)"), background: tint(color, 7) } : undefined}>
            <input type="checkbox" className="mt-1 accent-current shrink-0" style={{ accentColor: color }} checked={a.done}
              onChange={(e) => setList(list.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)))} />
            <AutoTextarea className={clsx("text-[13px] flex-1 !mx-0 !px-1 !py-0", a.done && "line-through text-muted")} value={a.text} placeholder="검증 가능한 기준을 입력"
              onChange={(text) => setList(list.map((x) => (x.id === a.id ? { ...x, text } : x)))} />
            <button className="btn btn-icon !p-0.5 text-muted opacity-0 group-hover:opacity-100 shrink-0" title="삭제" onClick={() => setList(list.filter((x) => x.id !== a.id))}><X size={12} /></button>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost btn-sm text-muted mt-1.5" onClick={() => setList([...list, { id: rid(), text: "", done: false }])}><Plus size={12} /> 기준 추가</button>
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
            <span key={i} className="chip bg-accent-soft text-accent border-transparent">{r}<button title="제거" onClick={() => onChange({ ...data, roles: roles.filter((_, j) => j !== i) })}><X size={11} /></button></span>
          ))}
          <input className="text-sm bg-transparent outline-none min-w-[120px]" placeholder="역할 입력 후 Enter" value={chip} onChange={(e) => setChip(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && chip.trim()) { onChange({ ...data, roles: [...roles, chip.trim()] }); setChip(""); } }} />
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-muted mb-0.5">근거</div>
        <AutoTextarea className="text-sm" placeholder="이 기능이 왜 필요한가요?" value={data.rationale ?? ""} onChange={(rationale) => onChange({ ...data, rationale })} />
      </div>
      <div>
        <div className="text-xs font-medium text-muted mb-0.5">성공 기준</div>
        <AutoTextarea className="text-sm" placeholder="측정 가능한 성공 기준" value={data.successCriteria ?? ""} onChange={(successCriteria) => onChange({ ...data, successCriteria })} />
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
      setProposal(() => {
        const next: Partial<Record<SpecSlot, string>> = {};
        for (const s of SPEC_SLOTS) if (r.slots[s]?.trim() && r.slots[s] !== slots[s]) next[s] = r.slots[s];
        return next;
      });
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
            <AutoTextarea className="text-sm" placeholder={`${SPEC_SLOT_LABEL[s]} 내용`} value={slots[s] ?? ""} onChange={(v) => setSlot(s, v)} />
            {proposal[s] !== undefined && (
              <div className="mt-1 rounded-lg border border-accent/40 bg-accent-soft/50 p-2 text-sm">
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
