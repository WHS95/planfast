"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, MessageSquare, Plus, Sparkles, Trash2, X } from "lucide-react";
import { ITEM_TYPE_LABEL, SPEC_SLOTS, SPEC_SLOT_LABEL, rid, type FeatureData, type Item, type RequirementData, type SpecData } from "@/lib/types";
import { useEditor } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import { useFeatures } from "./FeaturesContext";
import { Highlight } from "./Highlight";
import { SlotsEditor } from "./ItemDetail";
import { NewBadge, NumTag, PriorityBarsSelect, StatusChipSelect } from "./controls";
import { TYPE_CLASS, ancestorIds, tint } from "./utils";
import { useDialog } from "@/components/ui/DialogProvider";

/** click-to-edit text: shows highlighted text, becomes input/textarea on click */
function Inline({ value, onChange, q, className, placeholder, multiline }: { value: string; onChange: (v: string) => void; q: string; className?: string; placeholder: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => { setEditing(false); if (draft !== value) onChange(draft); };
  if (editing) {
    return multiline
      ? <textarea autoFocus className={clsx("field", className)} value={draft} rows={2} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} onBlur={commit} />
      : <input autoFocus className={clsx("field", className)} value={draft} onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commit(); }} />;
  }
  return (
    <div className={clsx("field cursor-text", multiline && "whitespace-pre-wrap", !value && "text-muted", className)} onClick={() => { setDraft(value); setEditing(true); }}>
      {value ? <Highlight text={value} q={q} /> : placeholder}
    </div>
  );
}

function Meta({ item }: { item: Item }) {
  const { confirm } = useDialog();
  const { store, removeItem, select, selectedId, numbers, resolveProposals } = useFeatures();
  const { mention } = useEditor();
  const num = numbers.get(item.id);
  return (
    <div className={clsx("flex items-center gap-2 flex-wrap", selectedId === item.id && "text-accent")}>
      {num && <NumTag n={num} className="!text-[11px]" />}
      <span className={clsx("chip border-transparent", TYPE_CLASS[item.type])}>{ITEM_TYPE_LABEL[item.type]}</span>
      {item.aiProposed && <NewBadge />}
      <StatusChipSelect value={item.status} onChange={(status) => store.update(item.id, { status })} />
      <PriorityBarsSelect value={item.priority} onChange={(priority) => store.update(item.id, { priority })} />
      {item.aiProposed ? (
        <>
          <button className="btn btn-sm btn-ghost text-muted hover:text-danger" title="이 제안을 삭제합니다" onClick={() => void resolveProposals("reject", [item.id])}><X size={12} /> 거절</button>
          <button className="btn btn-sm btn-primary" title="제안을 확정합니다" onClick={() => void resolveProposals("approve", [item.id])}><Check size={12} /> 승인</button>
        </>
      ) : (
        <>
          <button className="btn btn-icon text-muted" title="매니에게 질문" onClick={() => { select(item.id); mention({ type: "item", id: item.id, label: item.title || ITEM_TYPE_LABEL[item.type] }); }}><MessageSquare size={13} /></button>
          <button className="btn btn-icon text-muted hover:text-danger" title="삭제" onClick={async () => { if (await confirm({ message: `'${item.title || "(제목 없음)"}' 항목과 하위 항목을 삭제할까요?`, confirmLabel: "삭제", danger: true })) void removeItem(item.id); }}><Trash2 size={13} /></button>
        </>
      )}
    </div>
  );
}

export function DocumentView() {
  const { store, selectedId, select, query, currentMatchId, addChild, aiGenerate, aiBusy, aiBusyParentId, projectId, colors } = useFeatures();
  const reqs = store.children(null);
  const rootOf = (id: string) => { const a = ancestorIds(store.items, id); return a.length ? a[a.length - 1] : id; };
  // shown requirement follows the selection (search matches select too); falls back to the first one
  const reqId = selectedId && store.byId.has(selectedId) ? rootOf(selectedId) : reqs[0]?.id ?? null;
  useEffect(() => {
    if (!currentMatchId) return;
    const t = setTimeout(() => document.querySelector(`[data-doc-id="${currentMatchId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [currentMatchId, reqId]);

  const req = reqId ? store.byId.get(reqId) : undefined;
  const features = req ? store.children(req.id) : [];
  const color = (req && colors.get(req.id)) || "var(--line)";
  const focus = (id: string) => (currentMatchId === id ? "ring-2 ring-amber-400 rounded-md" : "");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-6">
        <div className="flex items-center gap-2 mb-6">
          <label className="text-xs text-muted">요구사항</label>
          <select className="input !w-auto" value={reqId ?? ""} onChange={(e) => select(e.target.value || null)}>
            {reqs.length === 0 && <option value="">(요구사항 없음)</option>}
            {reqs.map((r, i) => <option key={r.id} value={r.id}>{`${i + 1}. ${r.title || "(제목 없음)"}${r.aiProposed ? " · 신규" : ""}`}</option>)}
          </select>
          <button className="btn btn-sm ml-auto" onClick={() => void addChild(null)}><Plus size={12} /> 요구사항 추가</button>
        </div>

        {!req ? (
          <div className="text-sm text-muted py-10 text-center border rounded-lg border-dashed">요구사항을 추가하면 문서 형태로 편집할 수 있습니다.</div>
        ) : (
          <article className="space-y-8">
            <section data-doc-id={req.id} className={clsx("pl-4 rounded-r-lg", focus(req.id))} style={{ borderLeft: `3px solid ${color}`, background: tint(color, 4) }} onClick={() => selectedId !== req.id && select(req.id)}>
              <Meta item={req} />
              <Inline value={req.title} onChange={(title) => store.update(req.id, { title })} q={query} className="text-2xl font-bold mt-2" placeholder="요구사항 제목" />
              <Inline value={req.description} onChange={(description) => store.update(req.id, { description })} q={query} className="text-sm text-muted mt-1" placeholder="요구사항 설명" multiline />
              <details className="mt-3" open>
                <summary className="text-xs font-medium text-muted cursor-pointer">수용 기준 ({(req.data as RequirementData).acceptance?.length ?? 0})</summary>
                <ul className="mt-1 space-y-1">
                  {((req.data as RequirementData).acceptance ?? []).map((a) => (
                    <li key={a.id} className="flex items-start gap-2 group">
                      <input type="checkbox" className="mt-1.5" checked={a.done} onChange={(e) => store.update(req.id, { data: { acceptance: (req.data as RequirementData).acceptance.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x)) } })} />
                      <textarea className={clsx("field text-sm flex-1", a.done && "line-through text-muted")} rows={1} value={a.text} onChange={(e) => store.update(req.id, { data: { acceptance: (req.data as RequirementData).acceptance.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) } })} />
                      <button className="btn btn-icon text-muted opacity-0 group-hover:opacity-100" onClick={() => store.update(req.id, { data: { acceptance: (req.data as RequirementData).acceptance.filter((x) => x.id !== a.id) } })}><Trash2 size={12} /></button>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-ghost btn-sm text-muted mt-1" onClick={() => store.update(req.id, { data: { acceptance: [...((req.data as RequirementData).acceptance ?? []), { id: rid(), text: "", done: false }] } })}><Plus size={12} /> 기준 추가</button>
              </details>
            </section>

            {features.map((f, fi) => {
              const fd = f.data as FeatureData;
              const specs = store.children(f.id);
              return (
                <section key={f.id} data-doc-id={f.id} className={clsx("pt-6 border-t pl-4", focus(f.id))} style={{ boxShadow: `inset 2px 0 0 ${tint(color, 45, "var(--line)")}` }} onClick={(e) => { e.stopPropagation(); if (selectedId !== f.id) select(f.id); }}>
                  <Meta item={f} />
                  <Inline value={f.title} onChange={(title) => store.update(f.id, { title })} q={query} className="text-xl font-semibold mt-2" placeholder={`기능 ${fi + 1} 제목`} />
                  <Inline value={f.description} onChange={(description) => store.update(f.id, { description })} q={query} className="text-sm text-muted mt-1" placeholder="기능 설명" multiline />
                  <details className="mt-2">
                    <summary className="text-xs font-medium text-muted cursor-pointer">상세 (역할 · 근거 · 성공 기준)</summary>
                    <div className="mt-2 space-y-2 text-sm">
                      <div><span className="text-xs text-muted">사용자 역할</span>
                        <input className="field" placeholder="쉼표로 구분" value={(fd.roles ?? []).join(", ")} onChange={(e) => store.update(f.id, { data: { ...fd, roles: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} /></div>
                      <div><span className="text-xs text-muted">근거</span><textarea className="field" rows={2} value={fd.rationale ?? ""} onChange={(e) => store.update(f.id, { data: { ...fd, rationale: e.target.value } })} /></div>
                      <div><span className="text-xs text-muted">성공 기준</span><textarea className="field" rows={2} value={fd.successCriteria ?? ""} onChange={(e) => store.update(f.id, { data: { ...fd, successCriteria: e.target.value } })} /></div>
                    </div>
                  </details>

                  <div className="mt-4 space-y-5 pl-4" style={{ borderLeft: `2px solid ${tint(color, 30, "var(--line)")}` }}>
                    {specs.map((s) => {
                      const sd = s.data as SpecData;
                      const visibleSlots = SPEC_SLOTS.filter((k) => !(sd.hiddenSlots ?? []).includes(k));
                      return (
                        <div key={s.id} data-doc-id={s.id} className={focus(s.id)} onClick={(e) => { e.stopPropagation(); if (selectedId !== s.id) select(s.id); }}>
                          <Meta item={s} />
                          <Inline value={s.title} onChange={(title) => store.update(s.id, { title })} q={query} className="text-base font-semibold mt-1" placeholder="상세기능 제목" />
                          <Inline value={s.description} onChange={(description) => store.update(s.id, { description })} q={query} className="text-sm text-muted" placeholder="상세기능 설명" multiline />
                          <details className="mt-2" open={selectedId === s.id || visibleSlots.some((k) => sd.slots?.[k]?.trim())}>
                            <summary className="text-xs font-medium text-muted cursor-pointer">개발 준비 슬롯 ({visibleSlots.filter((k) => sd.slots?.[k]?.trim()).length}/{visibleSlots.length})</summary>
                            <div className="mt-2">
                              {selectedId === s.id
                                ? <SlotsEditor projectId={projectId} item={s} data={sd} onChange={(data) => store.update(s.id, { data })} compact />
                                : <dl className="text-sm space-y-1">{visibleSlots.map((k) => sd.slots?.[k]?.trim() ? <div key={k} className="flex gap-2"><dt className="text-xs text-muted w-20 shrink-0 pt-0.5">{SPEC_SLOT_LABEL[k]}</dt><dd className="whitespace-pre-wrap flex-1"><Highlight text={sd.slots![k]!} q={query} /></dd></div> : null)}</dl>}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                    <button className="btn btn-ghost btn-sm text-muted" onClick={(e) => { e.stopPropagation(); void addChild(f.id); }}><Plus size={12} /> 상세 기능 추가</button>
                  </div>
                </section>
              );
            })}
            <div className="pt-6 border-t flex gap-2">
              <button className="btn btn-sm" onClick={() => void addChild(req.id)}><Plus size={12} /> 기능 추가</button>
              <button className="btn btn-sm" disabled={aiBusy} onClick={() => aiGenerate(req.id)}>{aiBusy && aiBusyParentId === req.id ? <Spinner className="w-3 h-3" /> : <Sparkles size={12} />} 매니로 기능 생성</button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
