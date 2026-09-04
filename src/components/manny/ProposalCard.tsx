"use client";
import { Check, X, Sparkles, FilePlus2, FilePen, Trash2, FileText } from "lucide-react";
import clsx from "clsx";
import { PRIORITY_LABEL, STATUS_LABEL, SPEC_SLOT_LABEL, type Proposal, type ProposalOp, type SpecSlot } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = { requirement: "요구사항", feature: "기능", spec: "상세기능" };

function OpIcon({ op }: { op: ProposalOp }) {
  if (op.kind === "prd.set") return <FileText size={12} />;
  if (op.kind === "item.create") return <FilePlus2 size={12} />;
  if (op.kind === "item.update") return <FilePen size={12} />;
  return <Trash2 size={12} />;
}

function opTitle(op: ProposalOp): string {
  if (op.kind === "prd.set") return `PRD · ${op.sectionKey} · ${op.label}`;
  if (op.kind === "item.create") return `${TYPE_LABEL[op.type] ?? op.type} 추가`;
  if (op.kind === "item.update") return "항목 수정";
  return "항목 삭제";
}

function Preview({ op }: { op: ProposalOp }) {
  if (op.kind === "prd.set") return <div className="whitespace-pre-wrap">{op.content}</div>;
  if (op.kind === "item.create") {
    const d = (op.data ?? {}) as Record<string, unknown>;
    return (
      <div className="space-y-1">
        <div className="font-medium">{op.title}</div>
        {op.description && <div className="text-muted whitespace-pre-wrap">{op.description}</div>}
        {Array.isArray(d.acceptance) && d.acceptance.length > 0 && <ul className="list-disc pl-4">{(d.acceptance as { text: string }[]).map((a, i) => <li key={i}>{a.text}</li>)}</ul>}
        {Array.isArray(d.roles) && d.roles.length > 0 && <div><span className="text-muted">역할:</span> {(d.roles as string[]).join(", ")}</div>}
        {typeof d.rationale === "string" && d.rationale && <div><span className="text-muted">근거:</span> {d.rationale}</div>}
        {typeof d.successCriteria === "string" && d.successCriteria && <div><span className="text-muted">성공 기준:</span> {d.successCriteria}</div>}
        {!!d.slots && typeof d.slots === "object" && Object.entries(d.slots as Record<string, string>).map(([k, v]) => v && <div key={k}><span className="text-muted">{SPEC_SLOT_LABEL[k as SpecSlot] ?? k}:</span> {v}</div>)}
      </div>
    );
  }
  if (op.kind === "item.update") {
    const p = op.patch;
    return (
      <div className="space-y-1">
        <div className="text-[11px] text-muted font-mono">{op.itemId}</div>
        {p.title !== undefined && <div><span className="text-muted">제목 →</span> {p.title}</div>}
        {p.description !== undefined && <div><span className="text-muted">설명 →</span> <span className="whitespace-pre-wrap">{p.description}</span></div>}
        {p.priority && <div><span className="text-muted">중요도 →</span> {PRIORITY_LABEL[p.priority]}</div>}
        {p.status && <div><span className="text-muted">상태 →</span> {STATUS_LABEL[p.status]}</div>}
        {p.data && Object.entries(p.data).map(([k, v]) => (
          <div key={k}><span className="text-muted">{SPEC_SLOT_LABEL[k as SpecSlot] ?? k} →</span> {typeof v === "string" ? v : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : (x as { text?: string }).text ?? JSON.stringify(x))).join(", ") : JSON.stringify(v)}</div>
        ))}
      </div>
    );
  }
  return <div className="text-[11px] text-muted font-mono">{op.itemId}</div>;
}

export function ProposalCard({ proposal, busy, onApply, onReject }: { proposal: Proposal; busy?: boolean; onApply: () => void; onReject: () => void }) {
  const st = proposal.status;
  return (
    <div className={clsx("rounded-md border p-2.5 text-xs", st === "pending" ? "border-accent/40 bg-accent-soft/40" : st === "accepted" ? "border-ok/30 bg-ok-soft/40" : "opacity-60")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent mb-1">
        <Sparkles size={11} />
        <span className="inline-flex items-center gap-1 text-muted"><OpIcon op={proposal.op} /> {opTitle(proposal.op)}</span>
        <span className="ml-auto">
          {st === "accepted" && <span className="chip border-transparent bg-ok-soft text-ok">반영됨</span>}
          {st === "rejected" && <span className="chip border-transparent bg-black/[.05] text-muted">거절됨</span>}
        </span>
      </div>
      <div className="font-medium mb-1">{proposal.summary}</div>
      <div className="max-h-40 overflow-y-auto pr-1"><Preview op={proposal.op} /></div>
      {st === "pending" && (
        <div className="flex gap-1 mt-2">
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={onApply}><Check size={12} /> 반영</button>
          <button className="btn btn-sm" disabled={busy} onClick={onReject}><X size={12} /> 거절</button>
        </div>
      )}
    </div>
  );
}
