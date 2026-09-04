"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, Trash2, Check, X, Wand2, MessageSquare } from "lucide-react";
import clsx from "clsx";
import { api, debounce } from "@/lib/api";
import { rid, type Prd, type PrdField, type PrdSection } from "@/lib/types";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";

type Proposal = Record<string, string>; // fieldId -> proposed content

export function PrdEditor({ projectId, initial }: { projectId: string; initial: Prd }) {
  const { tick, mention } = useEditor();
  const [prd, setPrd] = useState<Prd>(initial);
  const [proposal, setProposal] = useState<Proposal>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const first = useRef(true);

  // reload when other panels mutate the project
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    api<{ prd: Prd }>(`/api/projects/${projectId}`).then((p) => setPrd(p.prd));
  }, [tick, projectId]);

  const save = useRef(debounce((next: Prd) => {
    api(`/api/projects/${projectId}`, { method: "PATCH", json: { prd: next } }).then(() => { setSaved(true); broadcastChange(projectId); });
  }, 600)).current;
  function update(next: Prd) { setPrd(next); setSaved(false); save(next); }

  function setField(secId: string, fieldId: string, patch: Partial<PrdField>) {
    update({ sections: prd.sections.map((s) => s.id !== secId ? s : { ...s, fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) }) });
  }
  function addField(secId: string) {
    update({ sections: prd.sections.map((s) => s.id !== secId ? s : { ...s, fields: [...s.fields, { id: rid(), label: "새 항목", content: "" }] }) });
  }
  function removeField(secId: string, fieldId: string) {
    update({ sections: prd.sections.map((s) => s.id !== secId ? s : { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }) });
  }
  function addSection() {
    update({ sections: [...prd.sections, { id: rid(), key: "custom", title: "새 섹션", fields: [{ id: rid(), label: "항목", content: "" }] }] });
  }
  function removeSection(secId: string) {
    update({ sections: prd.sections.filter((s) => s.id !== secId) });
  }

  async function aiFill(scope: "all" | string) {
    setBusy(scope);
    try {
      const r = await api<{ fields: Record<string, string> }>(`/api/projects/${projectId}/ai/prd`, { method: "POST", json: { sectionId: scope === "all" ? null : scope } });
      setProposal((p) => ({ ...p, ...r.fields }));
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }
  function accept(fieldId: string) {
    const sec = prd.sections.find((s) => s.fields.some((f) => f.id === fieldId))!;
    const f = sec.fields.find((x) => x.id === fieldId)!;
    const v = proposal[fieldId];
    if (f.values) setField(sec.id, fieldId, { values: v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) });
    else setField(sec.id, fieldId, { content: v });
    setProposal((p) => { const n = { ...p }; delete n[fieldId]; return n; });
  }
  function reject(fieldId: string) { setProposal((p) => { const n = { ...p }; delete n[fieldId]; return n; }); }
  const pendingCount = Object.keys(proposal).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold">프로덕트 요구사항 (PRD)</h1>
            <p className="text-xs text-muted mt-0.5">항목을 클릭해 바로 편집합니다. 변경 사항은 자동 저장됩니다. {saved ? "· 저장됨" : "· 저장 중…"}</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <>
                <button className="btn btn-sm" onClick={() => Object.keys(proposal).forEach(accept)}><Check size={14} /> 모두 반영 ({pendingCount})</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setProposal({})}><X size={14} /> 모두 거절</button>
              </>
            )}
            <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => aiFill("all")}>
              {busy === "all" ? <Spinner /> : <Sparkles size={14} />} 매니로 전체 작성
            </button>
          </div>
        </div>

        {prd.sections.map((sec) => (
          <section key={sec.id} className="card mb-4">
            <header className="flex items-center gap-2 px-5 py-3 border-b">
              <input className="font-medium bg-transparent outline-none flex-1 min-w-0" value={sec.title} onChange={(e) => update({ sections: prd.sections.map((s) => s.id === sec.id ? { ...s, title: e.target.value } : s) })} />
              <button className="btn btn-icon text-muted" title="매니에게 이 섹션 질문" onClick={() => mention({ type: "prd", id: sec.key, label: `PRD · ${sec.title}` })}><MessageSquare size={14} /></button>
              <button className="btn btn-icon text-muted" title="이 섹션 AI 작성/보완" disabled={busy !== null} onClick={() => aiFill(sec.id)}>{busy === sec.id ? <Spinner /> : <Wand2 size={14} />}</button>
              {sec.key === "custom" && <button className="btn btn-icon text-muted" onClick={() => removeSection(sec.id)}><Trash2 size={14} /></button>}
            </header>
            <div className="px-5 py-2 divide-y">
              {sec.fields.map((f) => (
                <FieldRow key={f.id} field={f} proposal={proposal[f.id]} onAccept={() => accept(f.id)} onReject={() => reject(f.id)}
                  onChange={(patch) => setField(sec.id, f.id, patch)} onRemove={() => removeField(sec.id, f.id)} />
              ))}
              <button className="btn btn-ghost btn-sm text-muted my-2" onClick={() => addField(sec.id)}><Plus size={14} /> 항목 추가</button>
            </div>
          </section>
        ))}
        <button className="btn btn-ghost text-muted" onClick={addSection}><Plus size={14} /> 섹션 추가</button>
      </div>
    </div>
  );
}

function FieldRow({ field, proposal, onChange, onRemove, onAccept, onReject }: { field: PrdField; proposal?: string; onChange: (p: Partial<PrdField>) => void; onRemove: () => void; onAccept: () => void; onReject: () => void }) {
  const [chip, setChip] = useState("");
  return (
    <div className="py-3 group">
      <div className="flex items-center gap-2 mb-1">
        <input className="text-xs font-medium text-muted bg-transparent outline-none" value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        <button className="btn btn-icon opacity-0 group-hover:opacity-100 text-muted ml-auto" onClick={onRemove}><Trash2 size={12} /></button>
      </div>
      {field.values ? (
        <div className="flex flex-wrap gap-1.5 items-center">
          {field.values.map((v, i) => (
            <span key={i} className="chip bg-accent-soft text-accent border-transparent">{v}<button onClick={() => onChange({ values: field.values!.filter((_, j) => j !== i) })}><X size={11} /></button></span>
          ))}
          <input className="text-sm bg-transparent outline-none min-w-[120px]" placeholder="입력 후 Enter" value={chip} onChange={(e) => setChip(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chip.trim()) { onChange({ values: [...field.values!, chip.trim()] }); setChip(""); } }} />
        </div>
      ) : (
        <textarea className="field text-sm" placeholder="내용을 입력하세요" value={field.content} onChange={(e) => onChange({ content: e.target.value })} rows={1} />
      )}
      {proposal !== undefined && (
        <div className={clsx("mt-2 rounded-md border border-accent/40 bg-accent-soft/50 p-3 text-sm")}>
          <div className="text-[11px] font-medium text-accent mb-1 flex items-center gap-1"><Sparkles size={11} /> 매니 제안</div>
          <div className="whitespace-pre-wrap">{proposal}</div>
          <div className="flex gap-1 mt-2">
            <button className="btn btn-sm btn-primary" onClick={onAccept}><Check size={12} /> 반영</button>
            <button className="btn btn-sm" onClick={onReject}><X size={12} /> 거절</button>
          </div>
        </div>
      )}
    </div>
  );
}
