"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui";
import { ITEM_TYPE_LABEL, type Item, type ItemType } from "@/lib/types";
import type { FeaturesProposal, ProposedFeature, ProposedRequirement, ProposedSpec } from "@/app/api/projects/[id]/ai/features/route";
import type { BulkItemInput } from "@/app/api/projects/[id]/items/route";
import { TYPE_CLASS } from "./utils";

interface Row { tempId: string; parentTempId: string | null; type: ItemType; title: string; description: string; depth: number; data: BulkItemInput["data"] }

function flatten(p: FeaturesProposal): Row[] {
  const rows: Row[] = [];
  let n = 0;
  const id = () => `t${++n}`;
  const spec = (s: ProposedSpec, parent: string | null, depth: number) => rows.push({ tempId: id(), parentTempId: parent, type: "spec", title: s.title, description: s.description, depth, data: { slots: s.slots, hiddenSlots: [] } });
  const feat = (f: ProposedFeature, parent: string | null, depth: number) => {
    const t = id();
    rows.push({ tempId: t, parentTempId: parent, type: "feature", title: f.title, description: f.description, depth, data: { roles: f.roles, rationale: f.rationale, successCriteria: f.successCriteria } });
    for (const s of f.specs) spec(s, t, depth + 1);
  };
  const req = (r: ProposedRequirement) => {
    const t = id();
    rows.push({ tempId: t, parentTempId: null, type: "requirement", title: r.title, description: r.description, depth: 0, data: { acceptance: r.acceptance.map((text, i) => ({ id: `${t}a${i}`, text, done: false })) } });
    for (const f of r.features) feat(f, t, 1);
  };
  for (const r of p.requirements ?? []) req(r);
  for (const f of p.features ?? []) feat(f, null, 0);
  for (const s of p.specs ?? []) spec(s, null, 0);
  return rows;
}

export function AiProposalDialog({ proposal, parent, onClose, onApply }: { proposal: FeaturesProposal; parent: Item | null; onClose: () => void; onApply: (rows: BulkItemInput[]) => Promise<void> }) {
  const rows = useMemo(() => flatten(proposal), [proposal]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map((r) => r.tempId)));
  const [busy, setBusy] = useState(false);
  const parentChecked = (r: Row): boolean => !r.parentTempId || (checked.has(r.parentTempId) && parentChecked(rows.find((x) => x.tempId === r.parentTempId)!));
  const effective = rows.filter((r) => checked.has(r.tempId) && parentChecked(r));

  function toggle(r: Row) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(r.tempId)) n.delete(r.tempId); else n.add(r.tempId);
      return n;
    });
  }
  async function apply() {
    setBusy(true);
    try {
      const idSet = new Set(effective.map((r) => r.tempId));
      const out: BulkItemInput[] = effective.map((r) => ({
        tempId: r.tempId,
        type: r.type,
        title: r.title,
        description: r.description,
        data: r.data,
        ...(r.parentTempId && idSet.has(r.parentTempId) ? { parentTempId: r.parentTempId } : { parentId: proposal.parentId }),
      }));
      await onApply(out);
      onClose();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  const title = parent ? `매니 제안 · '${parent.title || ITEM_TYPE_LABEL[parent.type]}' 하위 항목` : "매니 제안 · 기능명세서";
  return (
    <Dialog title={title} wide onClose={onClose}
      footer={
        <>
          <span className="text-xs text-muted mr-auto self-center">
            {effective.length}개 선택 {proposal.usage?.costUsd !== undefined && `· $${proposal.usage.costUsd.toFixed(3)}`}
          </span>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy || effective.length === 0} onClick={apply}>{busy ? <Spinner /> : <Check size={14} />} 선택 반영 ({effective.length})</button>
        </>
      }>
      <p className="text-xs text-muted mb-3 flex items-center gap-1"><Sparkles size={12} /> 반영할 항목을 선택하세요. 상위 항목을 해제하면 하위 항목도 함께 제외됩니다.</p>
      <div className="flex gap-1 mb-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setChecked(new Set(rows.map((r) => r.tempId)))}>모두 선택</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setChecked(new Set())}>모두 해제</button>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const enabled = parentChecked(r);
          return (
            <li key={r.tempId} className={clsx("flex items-start gap-2 rounded-md px-2 py-1.5", !enabled && "opacity-40", checked.has(r.tempId) && enabled && "bg-accent-soft/40")} style={{ marginLeft: r.depth * 20 }}>
              <input type="checkbox" className="mt-1" disabled={!enabled} checked={checked.has(r.tempId)} onChange={() => toggle(r)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={clsx("chip border-transparent", TYPE_CLASS[r.type])}>{ITEM_TYPE_LABEL[r.type]}</span>
                  <span className="text-sm font-medium truncate">{r.title}</span>
                </div>
                {r.description && <div className="text-xs text-muted mt-0.5 line-clamp-2">{r.description}</div>}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <div className="text-sm text-muted py-6 text-center">제안된 항목이 없습니다.</div>}
    </Dialog>
  );
}
