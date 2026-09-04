"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Bot, ChevronLeft, History, Plug, RefreshCw, RotateCcw, Save, Trash2, User } from "lucide-react";
import type { Activity, Project, Version } from "@/lib/types";
import { api } from "@/lib/api";
import { broadcastChange, useEditor } from "@/components/editor/EditorContext";
import { Empty, Spinner } from "@/components/ui";

const ACTION_LABEL: Record<string, string> = {
  "item.create": "항목 생성", "item.update": "항목 수정", "item.delete": "항목 삭제",
  "prd.update": "PRD 수정", "project.create": "프로젝트 생성", "project.rename": "이름 변경",
  "page.create": "페이지 생성", "page.update": "페이지 수정", "page.delete": "페이지 삭제",
  "flow.create": "플로우 생성", "flow.update": "플로우 수정", "flow.delete": "플로우 삭제",
  "wireframe.generate": "와이어프레임 생성", "attachment.add": "첨부 추가", "attachment.remove": "첨부 삭제",
  "version.create": "버전 저장", "version.restore": "버전 복원", "version.delete": "버전 삭제",
  "share.create": "공유 링크 생성", "share.disable": "공유 링크 비활성화", "share.enable": "공유 링크 활성화", "share.delete": "공유 링크 삭제", "share.view": "공유 링크 열람",
  export: "내보내기",
};
export function actionLabel(a: string) {
  if (ACTION_LABEL[a]) return ACTION_LABEL[a];
  if (a.startsWith("ai.")) return "매니 반영";
  if (a.startsWith("export")) return "내보내기";
  return a;
}
export function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function ActorIcon({ actor }: { actor: string }) {
  if (actor === "manny" || actor === "ai") return <Bot size={13} className="text-accent" />;
  if (actor === "mcp") return <Plug size={13} className="text-warn" />;
  return <User size={13} className="text-muted" />;
}

type Filter = "all" | "manny" | "mcp" | "user";
const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "전체" }, { key: "manny", label: "매니" }, { key: "mcp", label: "MCP" }, { key: "user", label: "나" }];

export function VersionPanel({ project }: { project: Project }) {
  const { tick, refresh } = useEditor();
  const [list, setList] = useState<Version[] | null>(null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState<string | null>(null);
  const base = `/api/projects/${project.id}`;

  const load = useCallback(async () => {
    const [v, a] = await Promise.all([api<Version[]>(`${base}/versions`), api<Activity[]>(`${base}/activity?limit=300`)]);
    setList(v); setActs(a);
  }, [base]);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load, tick]); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch + refetch on tick, not a state sync loop

  async function save() {
    setBusy(true); setErr(null);
    try { await api(`${base}/versions`, { method: "POST", json: { name } }); setName(""); await load(); broadcastChange(project.id); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const filtered = useMemo(() => acts.filter((a) => filter === "all" || (filter === "manny" ? a.actor === "manny" || a.actor === "ai" : a.actor === filter)), [acts, filter]);

  if (open) return <VersionDetail project={project} versionId={open} acts={acts} onBack={() => setOpen(null)} onChanged={async () => { await load(); refresh(); broadcastChange(project.id); }} />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <section className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><History size={14} /> 버전 기록</div>
        <div className="flex gap-1.5">
          <input className="input !py-1.5 text-sm" placeholder="PRD 1차 검토 완료" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && save()} />
          <button className="btn btn-primary btn-sm shrink-0" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save size={13} />} 버전 저장</button>
        </div>
        {err && <div className="text-xs text-danger">{err}</div>}
        {list === null ? <div className="py-6 text-center"><Spinner className="text-muted" /></div> : list.length === 0 ? <Empty>저장된 버전이 없어요. 10분마다 자동 저장돼요.</Empty> : (
          <ul className="space-y-0.5">
            {list.map((v) => (
              <li key={v.id}>
                <button onClick={() => setOpen(v.id)} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-black/[.03] dark:hover:bg-white/[.05] flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{v.name}</div>
                    <div className="text-[11px] text-muted">{fmt(v.createdAt)} · {timeAgo(v.createdAt)}</div>
                  </div>
                  {v.auto && <span className="chip text-muted">자동</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">작업 로그</div>
          <button className="btn btn-icon" title="새로고침" onClick={() => load()}><RefreshCw size={13} /></button>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={clsx("chip cursor-pointer", filter === f.key ? "bg-accent-soft text-accent border-transparent" : "text-muted hover:text-fg")}>{f.label}</button>)}
        </div>
        {filtered.length === 0 ? <Empty>기록이 없어요</Empty> : <ActivityList acts={filtered} />}
      </section>
    </div>
  );
}

export function ActivityList({ acts }: { acts: Activity[] }) {
  return (
    <ul className="space-y-1.5">
      {acts.map((a) => (
        <li key={a.id} className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 shrink-0"><ActorIcon actor={a.actor} /></span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{actionLabel(a.action)}</span>
            {a.target && <span className="text-muted"> · {a.target}</span>}
          </div>
          <span className="text-muted shrink-0" title={fmt(a.createdAt)}>{timeAgo(a.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function VersionDetail({ project, versionId, acts, onBack, onChanged }: { project: Project; versionId: string; acts: Activity[]; onBack: () => void; onChanged: () => Promise<void> }) {
  const [v, setV] = useState<(Version & { counts: { items: number; pages: number; flows: number } }) | null>(null);
  const [busy, setBusy] = useState<"restore" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const base = `/api/projects/${project.id}/versions/${versionId}`;
  useEffect(() => { api<typeof v>(base).then(setV).catch((e) => setErr(e.message)); }, [base]);
  const around = useMemo(() => (v ? acts.filter((a) => a.createdAt <= v.createdAt).slice(0, 10) : []), [acts, v]);

  async function restore() {
    if (!v || !confirm(`"${v.name}" 시점으로 복원할까요?\n현재 상태는 복원 전 자동 저장으로 보관됩니다.`)) return;
    setBusy("restore"); setErr(null);
    try { await api(base, { method: "POST" }); await onChanged(); onBack(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function remove() {
    if (!v || !confirm("이 버전을 삭제할까요?")) return;
    setBusy("delete");
    try { await api(base, { method: "DELETE" }); await onChanged(); onBack(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <button className="btn btn-ghost btn-sm -ml-2" onClick={onBack}><ChevronLeft size={14} /> 버전 목록</button>
      {err && <div className="text-xs text-danger">{err}</div>}
      {!v ? <div className="py-6 text-center"><Spinner className="text-muted" /></div> : (
        <>
          <div>
            <div className="font-medium flex items-center gap-2">{v.name} {v.auto && <span className="chip text-muted">자동</span>}</div>
            <div className="text-xs text-muted mt-1">{fmt(v.createdAt)} 저장</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["항목", v.counts.items], ["페이지", v.counts.pages], ["플로우", v.counts.flows]].map(([l, n]) => (
              <div key={l as string} className="card p-2"><div className="text-lg font-semibold">{n}</div><div className="text-[11px] text-muted">{l}</div></div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={restore} disabled={!!busy}>{busy === "restore" ? <Spinner /> : <RotateCcw size={13} />} 복원</button>
            <button className="btn btn-sm text-danger" onClick={remove} disabled={!!busy}><Trash2 size={13} /> 삭제</button>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">이 시점까지의 작업</div>
            {around.length === 0 ? <div className="text-xs text-muted">기록이 없어요</div> : <ActivityList acts={around} />}
          </div>
        </>
      )}
    </div>
  );
}
