"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, CircleDashed, AlertCircle, GripVertical, Trash2, RefreshCw, Play, RotateCcw, Monitor, Smartphone, Code2, MessageSquare, X, LayoutGrid, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { Device, WireframePage } from "@/lib/types";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Spinner } from "@/components/ui";
import type { WfSummary } from "./WireframeTab";
import { useDialog } from "@/components/ui/DialogProvider";
import { Storyboard } from "./Storyboard";

function StatusIcon({ status }: { status: WireframePage["status"] }) {
  if (status === "done") return <Check size={13} className="text-ok" />;
  if (status === "generating") return <Spinner className="!w-3 !h-3 text-accent" />;
  if (status === "error") return <AlertCircle size={13} className="text-danger" />;
  return <CircleDashed size={13} className="text-muted" />;
}

export function WireframeViewer({ projectId, wf, onChange, onReload }: { projectId: string; wf: WfSummary; onChange: (w: WfSummary) => void; onReload: () => void }) {
  const { confirm, alert, prompt } = useDialog();
  const { mention } = useEditor();
  const [pageId, setPageId] = useState<string | null>(wf.pages[0]?.id ?? null);
  /** 한 장씩 보기 ↔ 스토리보드(유즈케이스별 흐름) */
  const [mode, setMode] = useState<"single" | "story">("single");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/api/projects/${projectId}/wireframes/${wf.id}`;
  const pages = useMemo(() => [...wf.pages].sort((a, b) => a.order - b.order), [wf.pages]);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];

  const running = wf.running || pages.some((p) => p.status === "generating" || p.status === "pending");
  const remaining = pages.filter((p) => p.status === "pending" || p.status === "error").length;

  async function generate(mode: "continue" | "all" | "page", opts: { pageId?: string; request?: string } = {}) {
    if (mode === "all" && !(await confirm({ message: "모든 페이지를 처음부터 다시 생성할까요?\n기존 HTML은 덮어씌워집니다.", confirmLabel: "전체 다시 생성", danger: true }))) return;
    setBusy(mode);
    try { onChange(await api<WfSummary>(`${base}/generate`, { method: "POST", json: { mode, ...opts } })); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(null); }
  }
  async function regenPage() {
    if (!page) return;
    const request = await prompt({ title: "페이지 다시 생성", message: `"${page.name}" 페이지를 다시 생성합니다. 추가 요청사항이 있으면 입력하세요.`, placeholder: "예: 카드형 목록으로 바꿔주세요 (비워두면 그대로 재생성)", confirmLabel: "다시 생성" });
    if (request === null) return;
    generate("page", { pageId: page.id, request: request.trim() || undefined });
  }
  async function setDevice(device: Device) {
    if (device === wf.device) return;
    onChange(await api<WfSummary>(base, { method: "PATCH", json: { device } }));
  }
  async function renamePage(p: WireframePage, name: string) {
    setRenaming(null);
    if (!name.trim() || name.trim() === p.name) return;
    const np = await api<WireframePage>(`${base}/pages/${p.id}`, { method: "PATCH", json: { name } });
    onChange({ ...wf, pages: wf.pages.map((x) => (x.id === p.id ? np : x)) });
  }
  async function removePage(p: WireframePage) {
    if (!(await confirm({ message: `"${p.name}" 페이지를 삭제할까요?`, confirmLabel: "삭제", danger: true }))) return;
    await api(`${base}/pages/${p.id}`, { method: "DELETE" });
    onChange({ ...wf, pages: wf.pages.filter((x) => x.id !== p.id) });
    broadcastChange(projectId);
  }
  async function applyHtml(html: string) {
    if (!page) return;
    setBusy("html");
    try {
      const np = await api<WireframePage>(`${base}/pages/${page.id}`, { method: "PATCH", json: { html } });
      onChange({ ...wf, pages: wf.pages.map((x) => (x.id === page.id ? np : x)) });
      broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); } finally { setBusy(null); }
  }
  async function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = pages.map((p) => p.id);
    const from = ids.indexOf(dragId); const to = ids.indexOf(targetId);
    ids.splice(from, 1); ids.splice(to, 0, dragId);
    setDragId(null);
    onChange({ ...wf, pages: wf.pages.map((p) => ({ ...p, order: ids.indexOf(p.id) })) });
    await api(base, { method: "PATCH", json: { orderedIds: ids } });
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* page list */}
      <aside className="w-60 shrink-0 border-r bg-panel flex flex-col min-h-0">
        <div className="px-3 py-2 text-xs text-muted border-b flex items-center justify-between">
          <span>페이지 {pages.length}</span>
          <span>{wf.device === "mobile" ? "모바일" : "데스크톱"}</span>
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {pages.map((p) => (
            <li key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(p.id)}
              className={clsx("group flex items-center gap-1.5 px-2 py-1.5 text-sm cursor-pointer", page?.id === p.id ? "bg-accent-soft text-accent" : "hover:bg-black/[.03]", dragId === p.id && "opacity-50")}
              onClick={() => { setPageId(p.id); }}>
              <GripVertical size={12} className="text-muted/60 cursor-grab shrink-0" />
              <StatusIcon status={p.status} />
              {renaming === p.id ? (
                <input autoFocus className="flex-1 min-w-0 bg-transparent outline-none border-b border-accent text-sm" defaultValue={p.name}
                  onBlur={(e) => renamePage(p, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} onClick={(e) => e.stopPropagation()} />
              ) : (
                <span className="flex-1 min-w-0 truncate" title={p.error ?? p.name} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(p.id); }}>{p.name}</span>
              )}
              <button className="btn btn-icon !p-0.5 opacity-0 group-hover:opacity-100 text-muted" title="삭제" onClick={(e) => { e.stopPropagation(); removePage(p); }}><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
        <div className="p-2 border-t text-[11px] text-muted">더블클릭: 이름 변경 · 드래그: 순서 변경</div>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-10 border-b bg-panel flex items-center gap-1 px-2 shrink-0 text-xs">
          <button className="btn btn-sm btn-ghost" disabled={!page || running || busy !== null} onClick={regenPage} title="이 페이지만 다시 생성 (추가 요청 가능)"><RefreshCw size={13} /> 다시 생성</button>
          <button className="btn btn-sm btn-ghost" disabled={running || busy !== null || remaining === 0} onClick={() => generate("continue")} title="대기/오류 페이지 이어서 생성"><Play size={13} /> 이어서 생성{remaining ? ` (${remaining})` : ""}</button>
          <button className="btn btn-sm btn-ghost" disabled={running || busy !== null} onClick={() => generate("all")}><RotateCcw size={13} /> 전체 다시 생성</button>
          {running && <span className="text-muted ml-1 flex items-center gap-1"><Spinner className="!w-3 !h-3" /> 생성 중…</span>}
          <div className="ml-auto flex items-center gap-1">
            <div className="inline-flex border rounded-md overflow-hidden mr-1">
              <button className={clsx("px-2 py-1 flex items-center gap-1", mode === "single" ? "bg-accent-soft text-accent" : "text-muted")} title="한 장씩 보기" onClick={() => setMode("single")}><Square size={12} /> 한 장</button>
              <button className={clsx("px-2 py-1 border-l flex items-center gap-1", mode === "story" ? "bg-accent-soft text-accent" : "text-muted")} title="유즈케이스별 흐름으로 보기" onClick={() => setMode("story")}><LayoutGrid size={12} /> 스토리보드</button>
            </div>
            <div className="inline-flex border rounded-md overflow-hidden">
              <button className={clsx("px-2 py-1", wf.device === "desktop" ? "bg-accent-soft text-accent" : "text-muted")} title="데스크톱" onClick={() => setDevice("desktop")}><Monitor size={13} /></button>
              <button className={clsx("px-2 py-1", wf.device === "mobile" ? "bg-accent-soft text-accent" : "text-muted")} title="모바일" onClick={() => setDevice("mobile")}><Smartphone size={13} /></button>
            </div>
            <button className={clsx("btn btn-sm btn-ghost", editing && "bg-accent-soft text-accent")} disabled={!page || mode === "story"} onClick={() => setEditing((e) => !e)}><Code2 size={13} /> HTML 편집</button>
            <button className="btn btn-sm btn-ghost" disabled={!page} onClick={() => page && mention({ type: "wireframe", id: page.id, label: `와이어프레임 · ${page.name}` })}><MessageSquare size={13} /> 매니에게 질문</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className={clsx("flex-1 min-w-0 overflow-auto bg-bg", mode === "single" && "p-6")}>
            {mode === "story" ? (
              <Storyboard pages={pages} device={wf.device} onOpen={(p) => { setPageId(p.id); setMode("single"); }} />
            ) : !page ? (
              <div className="text-sm text-muted text-center py-20">페이지가 없습니다. 상단에서 새 와이어프레임을 만들어 주세요.</div>
            ) : page.status === "done" && page.html ? (
              wf.device === "mobile" ? (
                <div className="mx-auto w-fit rounded-[44px] border-[10px] border-zinc-800 bg-zinc-800 shadow-xl overflow-hidden">
                  <iframe key={page.id + page.updatedAt} sandbox="" srcDoc={page.html} title={page.name} className="block bg-white rounded-[34px]" style={{ width: 390, height: 844 }} />
                </div>
              ) : (
                <div className="card overflow-hidden shadow-sm min-w-[1024px] h-full">
                  <iframe key={page.id + page.updatedAt} sandbox="" srcDoc={page.html} title={page.name} className="block bg-white w-full h-full min-h-[800px]" />
                </div>
              )
            ) : page.status === "error" ? (
              <div className="max-w-md mx-auto mt-20 card p-5 text-sm">
                <div className="flex items-center gap-2 text-danger font-medium mb-2"><AlertCircle size={15} /> 생성 실패</div>
                <div className="text-muted text-xs break-all mb-3">{page.error ?? "알 수 없는 오류"}</div>
                <button className="btn btn-sm" disabled={running} onClick={regenPage}><RefreshCw size={13} /> 다시 시도</button>
              </div>
            ) : (
              <div className="text-sm text-muted text-center py-20 flex flex-col items-center gap-2">
                <Spinner className="text-accent" />
                {page.status === "generating" ? "이 페이지를 생성하는 중입니다…" : "생성 대기 중"}
              </div>
            )}
          </div>
          {editing && page && (
            <HtmlEditor key={page.id + page.updatedAt} name={page.name} initial={page.html} saving={busy === "html"} onApply={applyHtml} onClose={() => setEditing(false)} onRevert={onReload} />
          )}
        </div>
      </div>
    </div>
  );
}

function HtmlEditor({ name, initial, saving, onApply, onClose, onRevert }: { name: string; initial: string; saving: boolean; onApply: (html: string) => void; onClose: () => void; onRevert: () => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="w-[420px] shrink-0 border-l bg-panel flex flex-col min-h-0">
      <div className="px-3 py-2 border-b flex items-center gap-2 text-xs">
        <span className="font-medium truncate">HTML 편집 · {name}</span>
        <button className="btn btn-sm btn-primary ml-auto" disabled={saving || draft === initial} onClick={() => onApply(draft)}>{saving ? <Spinner /> : <Check size={12} />} 적용</button>
        <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
      </div>
      <textarea className="flex-1 w-full resize-none outline-none p-3 font-mono text-[11px] leading-relaxed bg-transparent" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="px-3 py-1.5 border-t text-[11px] text-muted flex items-center justify-between">
        <span>적용하면 페이지 HTML이 저장됩니다.</span>
        <button className="underline" onClick={() => { setDraft(initial); onRevert(); }}>되돌리기</button>
      </div>
    </div>
  );
}
