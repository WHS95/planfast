"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, RotateCw, AlertTriangle, Lightbulb, MessageSquare, Pause, Check } from "lucide-react";
import clsx from "clsx";
import { REVIEW_PERSPECTIVES, REVIEW_PERSPECTIVE_LABEL, type Project, type Review, type ReviewItem, type ReviewPerspective } from "@/lib/types";
import { api } from "@/lib/api";
import { useEditor } from "@/components/editor/EditorContext";
import { Spinner, Empty } from "@/components/ui";

export function ReviewPanel({ project }: { project: Project }) {
  const pid = project.id;
  const router = useRouter();
  const { mention, setSelection } = useEditor();
  const [review, setReview] = useState<Review | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<ReviewPerspective>>(new Set(REVIEW_PERSPECTIVES));

  const load = useCallback(async () => {
    const r = await api<{ review: Review | null; items: ReviewItem[] }>(`/api/projects/${pid}/review`);
    setReview(r.review);
    setItems(r.items);
    if (r.review) setSelected(new Set(r.review.perspectives));
    setLoading(false);
  }, [pid]);
  useEffect(() => {
    let alive = true;
    api<{ review: Review | null; items: ReviewItem[] }>(`/api/projects/${pid}/review`).then((r) => {
      if (!alive) return;
      setReview(r.review);
      setItems(r.items);
      if (r.review) setSelected(new Set(r.review.perspectives));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [pid]);

  function toggle(p: ReviewPerspective) {
    setSelected((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  }

  async function run() {
    if (!selected.size) return;
    setRunning(true); setError(null); setWarning(null);
    try {
      const r = await api<{ review: Review; items: ReviewItem[]; warning?: string }>(`/api/projects/${pid}/review`, { method: "POST", json: { perspectives: [...selected] } });
      setReview(r.review); setItems(r.items);
      if (r.warning) setWarning(r.warning);
    } catch (e) { setError((e as Error).message); } finally { setRunning(false); }
  }

  async function setStatus(item: ReviewItem, status: ReviewItem["status"]) {
    setItems((its) => its.map((x) => (x.id === item.id ? { ...x, status } : x)));
    try { await api(`/api/projects/${pid}/review/${item.id}`, { method: "PATCH", json: { status } }); } catch (e) { setError((e as Error).message); load(); }
  }

  function goTo(item: ReviewItem) {
    if (item.target.startsWith("item:")) {
      const id = item.target.slice(5);
      setSelection({ type: "item", id, label: item.targetLabel });
      router.push(`/p/${pid}/features?item=${id}`);
    } else {
      router.push(`/p/${pid}/prd`);
    }
  }

  function solveInChat(item: ReviewItem) {
    if (item.target.startsWith("item:")) mention({ type: "item", id: item.target.slice(5), label: item.targetLabel });
    else mention({ type: "prd", id: item.target.slice(4), label: item.targetLabel });
  }

  const counts = { open: items.filter((i) => i.status === "open").length, hold: items.filter((i) => i.status === "hold").length, resolved: items.filter((i) => i.status === "resolved").length };
  const grouped = REVIEW_PERSPECTIVES.map((p) => ({ p, list: items.filter((i) => i.perspective === p) })).filter((g) => g.list.length > 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-11 border-b flex items-center px-3 gap-2 shrink-0">
        <ClipboardCheck size={15} className="text-accent" />
        <span className="text-sm font-medium">검토</span>
        {items.length > 0 && (
          <span className="ml-auto text-[11px] text-muted">열림 {counts.open} · 보류 {counts.hold} · 해결 {counts.resolved}</span>
        )}
      </div>

      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {REVIEW_PERSPECTIVES.map((p) => (
            <button key={p} onClick={() => toggle(p)} className={clsx("chip cursor-pointer", selected.has(p) ? "bg-accent-soft text-accent border-accent/30" : "text-muted")}>
              {REVIEW_PERSPECTIVE_LABEL[p]}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm w-full" disabled={running || !selected.size} onClick={run}>
          {running ? <Spinner /> : review ? <RotateCw size={14} /> : <ClipboardCheck size={14} />}
          {running ? (selected.has("edge_case") ? "검토 중… (정합성 감사 포함, 최대 3~5분)" : "검토 중… (최대 1~2분)") : review ? "다시 검토" : "검토 시작"}
        </button>
        {selected.has("edge_case") && <p className="text-[11px] text-muted">정합성 감사는 요구사항을 분해해 상태·경계값·비정상 흐름·5W1H를 기계적으로 훑는 심층 감사이며, Claude Fable 5.1로 실행됩니다. 시간이 더 걸립니다.</p>}
        {error && <div className="text-xs text-danger">{error}</div>}
        {warning && <div className="text-xs text-warn">일부 관점 실행 실패: {warning}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading && <div className="text-xs text-muted text-center py-8"><Spinner className="mx-auto mb-2" />불러오는 중…</div>}
        {!loading && !review && <Empty>검토 관점을 선택하고 검토를 시작하세요.<br />PRD와 기능명세서를 종합적으로 점검합니다.</Empty>}
        {!loading && review && items.length === 0 && !running && <Empty>발견된 이슈가 없습니다.</Empty>}
        {grouped.map(({ p, list }) => (
          <div key={p}>
            <div className="text-xs font-semibold text-muted mb-1.5">{REVIEW_PERSPECTIVE_LABEL[p]} ({list.length})</div>
            <div className="space-y-2">
              {list.map((it) => (
                <div key={it.id} className={clsx("rounded-md border p-2.5 text-xs", it.status === "resolved" && "opacity-50", it.status === "hold" && "opacity-75")}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {it.severity === "critical" ? <AlertTriangle size={12} className="text-danger shrink-0" /> : it.severity === "warn" ? <AlertTriangle size={12} className="text-warn shrink-0" /> : <Lightbulb size={12} className="text-accent shrink-0" />}
                    <span className={clsx("chip border-transparent !py-0", it.severity === "critical" ? "bg-danger/10 text-danger" : it.severity === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent")}>
                      {it.severity === "critical" ? "S1 · 심각" : it.severity === "warn" ? "주의" : "제안"}
                    </span>
                    <button className="text-[11px] text-muted hover:text-accent hover:underline truncate ml-auto" onClick={() => goTo(it)}>{it.targetLabel}</button>
                  </div>
                  <div className="font-medium mb-1">{it.title}</div>
                  <div className="text-muted whitespace-pre-wrap mb-2">{it.body}</div>
                  <div className="flex gap-1">
                    {it.status !== "hold" && <button className="btn btn-sm" onClick={() => setStatus(it, "hold")}><Pause size={11} /> 보류</button>}
                    {it.status !== "resolved" && <button className="btn btn-sm" onClick={() => setStatus(it, "resolved")}><Check size={11} /> 해결</button>}
                    {it.status !== "open" && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(it, "open")}>다시 열기</button>}
                    <button className="btn btn-sm btn-ghost" onClick={() => solveInChat(it)}><MessageSquare size={11} /> 채팅으로 해결</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
