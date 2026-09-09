"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Trash2, Plus, CheckCircle2, ArrowRightCircle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api, debounce, readSse } from "@/lib/api";
import type { Decision, Meeting } from "@/lib/types";
import { Spinner } from "@/components/ui";

const STATUS_LABEL: Record<Decision["status"], string> = { confirmed: "확정", undecided: "미정", rejected: "기각" };
const STATUS_COLOR: Record<Decision["status"], string> = {
  confirmed: "bg-ok-soft text-ok",
  undecided: "bg-black/[.05] text-muted",
  rejected: "bg-danger/10 text-danger",
};

export function MeetingEditor({ meeting, initialDecisions, projects }: { meeting: Meeting; initialDecisions: Decision[]; projects: { id: string; title: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(meeting.title);
  const [heldAt, setHeldAt] = useState(meeting.heldAt.slice(0, 10));
  const [projectId, setProjectId] = useState(meeting.projectId ?? "");
  const [content, setContent] = useState(meeting.content);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [saved, setSaved] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useRef(debounce((patch: Partial<Meeting>) => {
    api(`/api/meetings/${meeting.id}`, { method: "PATCH", json: patch }).then(() => setSaved(true));
  }, 700)).current;
  function patch(p: Partial<{ title: string; heldAt: string; projectId: string | null; content: string }>) {
    setSaved(false); save(p);
  }

  /** 스트리밍 — 결정이 추출되는 대로 목록에 하나씩 추가된다. */
  async function extract() {
    setExtracting(true); setError(null);
    try {
      await readSse(`/api/meetings/${meeting.id}/extract/stream`, { method: "POST" }, (event, data) => {
        if (event === "decision") { const d = (data as { decision: Decision }).decision; setDecisions((ds) => (ds.some((x) => x.id === d.id) ? ds : [...ds, d])); }
        else if (event === "done") setDecisions((data as { decisions: Decision[] }).decisions);
        else if (event === "error") throw new Error((data as { message?: string }).message ?? "추출 중 오류");
      });
    } catch (e) { setError((e as Error).message); } finally { setExtracting(false); }
  }

  async function updateDecision(id: string, p: Partial<Pick<Decision, "text" | "rationale" | "status">>) {
    setDecisions((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
    await api(`/api/meetings/${meeting.id}/decisions/${id}`, { method: "PATCH", json: p }).catch((e) => setError((e as Error).message));
  }
  async function removeDecision(id: string) {
    setDecisions((ds) => ds.filter((d) => d.id !== id));
    await api(`/api/meetings/${meeting.id}/decisions/${id}`, { method: "DELETE" }).catch((e) => setError((e as Error).message));
  }
  async function addDecision() {
    const d = await api<Decision>(`/api/meetings/${meeting.id}/decisions`, { method: "POST", json: { text: "새 결정" } }).catch(() => null);
    if (d) setDecisions((ds) => [...ds, d]);
  }

  async function apply() {
    if (!projectId) { setError("반영할 프로젝트를 먼저 연결하세요"); return; }
    setApplying(true); setError(null);
    try {
      const r = await api<{ url: string; proposals: number }>(`/api/meetings/${meeting.id}/apply`, { method: "POST" });
      if (r.proposals === 0) setError("생성된 제안이 없습니다");
      router.push(r.url);
    } catch (e) { setError((e as Error).message); } finally { setApplying(false); }
  }

  const confirmedUnapplied = decisions.filter((d) => d.status === "confirmed" && !d.applied).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/meetings" className="text-xs text-muted hover:text-fg inline-flex items-center gap-1 mb-4"><ArrowLeft size={13} /> 기획실</Link>

        <div className="flex items-start gap-3 mb-4">
          <input className="text-xl font-semibold bg-transparent outline-none flex-1 min-w-0 rounded px-1 -mx-1 hover:bg-black/[.03] focus:bg-black/[.04]"
            value={title} onChange={(e) => { setTitle(e.target.value); patch({ title: e.target.value }); }} />
          <span className="text-xs text-muted mt-2 shrink-0">{saved ? "저장됨" : "저장 중…"}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          <label className="flex items-center gap-1.5 text-xs text-muted">회의 일시
            <input type="date" className="input !w-auto !py-1" value={heldAt} onChange={(e) => { setHeldAt(e.target.value); patch({ heldAt: new Date(e.target.value).toISOString() }); }} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">연결된 프로젝트
            <select className="input !w-auto !py-1" value={projectId} onChange={(e) => { setProjectId(e.target.value); patch({ projectId: e.target.value || null }); }}>
              <option value="">(연결 안 함)</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>

        <section className="card mb-4">
          <header className="px-4 py-2.5 border-b flex items-center justify-between">
            <span className="text-sm font-medium">회의 내용</span>
          </header>
          <textarea className="field text-sm w-full p-4 min-h-[220px]" placeholder="회의에서 논의된 내용을 자유롭게 적어주세요…"
            value={content} onChange={(e) => { setContent(e.target.value); patch({ content: e.target.value }); }} />
        </section>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">결정 사항 ({decisions.length})</h2>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={addDecision}><Plus size={13} /> 직접 추가</button>
            <button className="btn btn-sm btn-primary" disabled={extracting || !content.trim()} onClick={extract}>
              {extracting ? <Spinner /> : <Sparkles size={13} />} 결정 추출
            </button>
          </div>
        </div>

        {error && <div className="text-xs text-danger mb-2">{error}</div>}

        <div className="space-y-2 mb-6">
          {decisions.length === 0 && <div className="text-muted text-sm py-6 text-center border rounded-lg border-dashed">결정 사항이 없습니다. 회의 내용을 적고 &quot;결정 추출&quot;을 눌러보세요.</div>}
          {decisions.map((d) => (
            <div key={d.id} className="card p-3">
              <div className="flex items-start gap-2">
                <textarea className="field text-sm flex-1 font-medium" rows={1} value={d.text} onChange={(e) => updateDecision(d.id, { text: e.target.value })} />
                <select className="input !w-auto !py-1 text-xs" value={d.status} onChange={(e) => updateDecision(d.id, { status: e.target.value as Decision["status"] })}>
                  {(["confirmed", "undecided", "rejected"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button className="btn btn-icon text-muted" onClick={() => removeDecision(d.id)}><Trash2 size={13} /></button>
              </div>
              <textarea className="field text-xs text-muted mt-1" rows={1} placeholder="근거 / 맥락" value={d.rationale} onChange={(e) => updateDecision(d.id, { rationale: e.target.value })} />
              <div className="flex items-center gap-1.5 mt-1">
                <span className={clsx("chip border-transparent !py-0", STATUS_COLOR[d.status])}>{STATUS_LABEL[d.status]}</span>
                {d.applied && <span className="chip border-transparent bg-accent-soft text-accent !py-0"><CheckCircle2 size={10} /> 반영됨</span>}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" disabled={applying || !confirmedUnapplied} onClick={apply}>
          {applying ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightCircle size={14} />} 기획서에 반영 {confirmedUnapplied > 0 ? `(확정 ${confirmedUnapplied}건)` : ""}
        </button>
        {!projectId && <div className="text-xs text-muted mt-1.5">기획서에 반영하려면 먼저 프로젝트를 연결하세요.</div>}
      </div>
    </div>
  );
}
