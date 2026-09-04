"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, CheckCircle2, MessageSquare, Pencil, Trash2, Undo2, X } from "lucide-react";
import type { Comment, Project } from "@/lib/types";
import { api } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Empty, Spinner } from "@/components/ui";
import { timeAgo } from "./VersionPanel";

const TYPE_LABEL: Record<string, string> = { item: "항목", prd: "PRD", flow: "플로우", wireframe: "와이어프레임", page: "페이지", project: "프로젝트" };
function targetLabel(t: string, sel: { type: string; id: string; label: string } | null) {
  if (t === "project") return "프로젝트 전체";
  const [type, id] = t.split(":");
  if (sel && `${sel.type}:${sel.id}` === t) return `${TYPE_LABEL[type] ?? type} · ${sel.label}`;
  return `${TYPE_LABEL[type] ?? type} · ${id?.slice(0, 8) ?? ""}`;
}

export function CommentPanel({ project }: { project: Project }) {
  const { tick, selection } = useEditor();
  const [list, setList] = useState<Comment[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = `/api/projects/${project.id}/comments`;
  const target = selection ? `${selection.type}:${selection.id}` : "project";

  const load = useCallback(() => api<Comment[]>(base).then(setList).catch((e) => setErr(e.message)), [base]);
  useEffect(() => { load(); }, [load, tick]);

  const visible = useMemo(() => (list ?? []).filter((c) => showResolved || !c.resolved), [list, showResolved]);
  const current = visible.filter((c) => c.target === target);
  const groups = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of visible) if (c.target !== target) m.set(c.target, [...(m.get(c.target) ?? []), c]);
    return [...m.entries()];
  }, [visible, target]);
  const resolvedCount = (list ?? []).filter((c) => c.resolved).length;

  async function add(body: string) {
    setErr(null);
    try { await api(base, { method: "POST", json: { target, body } }); await load(); } catch (e) { setErr((e as Error).message); }
  }
  async function patch(id: string, p: Partial<Pick<Comment, "body" | "resolved">>) { await api(`${base}/${id}`, { method: "PATCH", json: p }); await load(); }
  async function remove(id: string) { if (!confirm("코멘트를 삭제할까요?")) return; await api(`${base}/${id}`, { method: "DELETE" }); await load(); }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <section className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><MessageSquare size={14} /> 코멘트</div>
        <div className="text-xs">
          {selection
            ? <span>현재 선택: <span className="chip bg-accent-soft text-accent border-transparent">{TYPE_LABEL[selection.type] ?? selection.type} · {selection.label}</span></span>
            : <span className="text-muted">문서에서 항목을 선택하면 코멘트를 남길 수 있어요. 지금은 프로젝트 전체에 남겨요.</span>}
        </div>
        <Composer onSubmit={add} />
        {err && <div className="text-xs text-danger">{err}</div>}
        {list === null ? <div className="py-4 text-center"><Spinner className="text-muted" /></div> : current.length === 0
          ? <div className="text-xs text-muted">아직 코멘트가 없어요</div>
          : <ul className="space-y-2">{current.map((c) => <CommentRow key={c.id} c={c} onPatch={patch} onRemove={remove} />)}</ul>}
      </section>
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">전체</div>
          <button className={clsx("chip cursor-pointer", showResolved ? "bg-accent-soft text-accent border-transparent" : "text-muted hover:text-fg")} onClick={() => setShowResolved((v) => !v)}>
            <CheckCircle2 size={11} /> 해결됨 {resolvedCount > 0 && `(${resolvedCount})`}
          </button>
        </div>
        {groups.length === 0 ? <Empty>다른 코멘트가 없어요</Empty> : groups.map(([t, cs]) => (
          <div key={t} className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted uppercase tracking-wide">{targetLabel(t, selection)}</div>
            <ul className="space-y-2">{cs.map((c) => <CommentRow key={c.id} c={c} onPatch={patch} onRemove={remove} />)}</ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function Composer({ onSubmit }: { onSubmit: (body: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() { const b = v.trim(); if (!b || busy) return; setBusy(true); try { await onSubmit(b); setV(""); } finally { setBusy(false); } }
  return (
    <div className="card p-2">
      <textarea className="w-full bg-transparent outline-none text-sm resize-none min-h-[52px]" placeholder="코멘트 입력 (Enter 전송, Shift+Enter 줄바꿈)" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
      <div className="flex justify-end"><button className="btn btn-primary btn-sm" onClick={go} disabled={busy || !v.trim()}>{busy ? <Spinner /> : null} 남기기</button></div>
    </div>
  );
}

function CommentRow({ c, onPatch, onRemove }: { c: Comment; onPatch: (id: string, p: Partial<Pick<Comment, "body" | "resolved">>) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [edit, setEdit] = useState<string | null>(null);
  async function saveEdit() { const b = edit?.trim(); if (b && b !== c.body) await onPatch(c.id, { body: b }); setEdit(null); }
  return (
    <li className={clsx("card p-2.5 text-sm group", c.resolved && "opacity-60")}>
      {edit !== null ? (
        <div className="space-y-1.5">
          <textarea className="input !py-1.5 text-sm min-h-[52px]" value={edit} autoFocus onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEdit(null); }} />
          <div className="flex justify-end gap-1"><button className="btn btn-sm" onClick={() => setEdit(null)}><X size={12} /></button><button className="btn btn-primary btn-sm" onClick={saveEdit}><Check size={12} /> 저장</button></div>
        </div>
      ) : (
        <>
          <div className={clsx("whitespace-pre-wrap break-words", c.resolved && "line-through")}>{c.body}</div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-muted">{timeAgo(c.createdAt)}{c.resolved && " · 해결됨"}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="btn btn-icon !p-1" title={c.resolved ? "다시 열기" : "해결"} onClick={() => onPatch(c.id, { resolved: !c.resolved })}>{c.resolved ? <Undo2 size={12} /> : <Check size={12} />}</button>
              <button className="btn btn-icon !p-1" title="수정" onClick={() => setEdit(c.body)}><Pencil size={12} /></button>
              <button className="btn btn-icon !p-1 text-danger" title="삭제" onClick={() => onRemove(c.id)}><Trash2 size={12} /></button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
