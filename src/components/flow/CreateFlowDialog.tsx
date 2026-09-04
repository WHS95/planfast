"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Sparkles, X } from "lucide-react";
import { Spinner } from "@/components/ui";
import type { FlowReadiness } from "@/lib/flow/readiness";

const CHIPS = ["핵심 여정만", "모바일 기준", "예외 흐름 포함", "온보딩 중심"];

export function CreateFlowDialog({ projectId, readiness, busy, onGenerate, onCreateBlank, onClose }: {
  projectId: string; readiness: FlowReadiness; busy: boolean;
  onGenerate: (name: string, request: string) => void;
  onCreateBlank: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  function addChip(c: string) { setRequest((r) => (r.includes(c) ? r : `${r.trim()}${r.trim() ? "\n" : ""}${c}`)); }
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div className="card w-[520px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-5 py-3 border-b">
          <div className="font-medium">새 유저플로우</div>
          <button className="btn btn-icon text-muted ml-auto" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!readiness.ready && (
            <div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-xs flex gap-2">
              <AlertCircle size={14} className="text-warn shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-1">매니가 유저플로우를 만들려면 먼저 아래가 필요해요.</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {!readiness.hasPrd && <li>PRD 개요의 <b>한 줄 정의</b> 작성 → <Link className="text-accent underline" href={`/p/${projectId}/prd`}>PRD 탭으로</Link></li>}
                  {!readiness.hasFeature && <li>기능명세서에 <b>기능 1개 이상</b> 추가 → <Link className="text-accent underline" href={`/p/${projectId}/features`}>기능명세서 탭으로</Link></li>}
                </ul>
                <div className="text-muted mt-1">빈 플로우를 만들어 직접 그릴 수는 있습니다.</div>
              </div>
            </div>
          )}
          <div>
            <label className="text-[11px] font-medium text-muted">이름 <span className="text-muted/70">(비우면 매니가 정합니다)</span></label>
            <input className="input mt-1" placeholder="예: 회원가입 및 첫 주문 흐름" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted">추가 요청 사항</label>
            <textarea className="input mt-1 min-h-[96px] resize-y" placeholder="어떤 여정을 그릴지, 강조할 점을 적어주세요." value={request} onChange={(e) => setRequest(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CHIPS.map((c) => <button key={c} className="chip hover:bg-accent-soft hover:text-accent" onClick={() => addChip(c)}>+ {c}</button>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t">
          <button className="btn btn-sm btn-ghost text-muted" disabled={busy} onClick={() => onCreateBlank(name.trim() || "새 유저플로우")}>빈 플로우 만들기</button>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-sm" disabled={busy} onClick={onClose}>취소</button>
            <button className="btn btn-sm btn-primary" disabled={busy || !readiness.ready} onClick={() => onGenerate(name.trim(), request.trim())}>
              {busy ? <Spinner /> : <Sparkles size={13} />} 매니로 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
