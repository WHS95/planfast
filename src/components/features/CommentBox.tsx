"use client";
/** 코멘트 목록/작성 for one item (target = `item:<id>`). */
import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { api } from "@/lib/api";
import { broadcastChange } from "@/components/editor/EditorContext";
import type { Comment } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { useDialog } from "@/components/ui/DialogProvider";

function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CommentBox({ projectId, itemId }: { projectId: string; itemId: string }) {
  const { alert } = useDialog();
  const target = `item:${itemId}`;
  // keyed by target so switching items shows the loading state without a setState-in-effect
  const [loaded, setLoaded] = useState<{ target: string; list: Comment[] }>({ target: "", list: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = loaded.target === target ? loaded.list : null;

  useEffect(() => {
    let alive = true;
    api<Comment[]>(`/api/projects/${projectId}/comments?target=${encodeURIComponent(target)}`)
      .then((r) => { if (alive) setLoaded({ target, list: r.filter((c) => c.target === target) }); })
      .catch(() => { if (alive) setLoaded({ target, list: [] }); });
    return () => { alive = false; };
  }, [projectId, target]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const c = await api<Comment>(`/api/projects/${projectId}/comments`, { method: "POST", json: { target, body } });
      setText("");
      setLoaded((l) => (l.target === target ? { target, list: [...l.list, c] } : l));
      broadcastChange(projectId);
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="pt-3 border-t">
      <div className="text-xs font-medium text-muted mb-2 flex items-center gap-1"><MessageSquare size={12} /> 코멘트 {list?.length ? `(${list.length})` : ""}</div>
      {list === null ? (
        <div className="text-xs text-muted flex items-center gap-1.5 py-1"><Spinner className="w-3 h-3" /> 불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-muted py-1">아직 코멘트가 없습니다.</div>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {list.map((c) => (
            <li key={c.id} className="rounded-lg border px-2.5 py-1.5">
              <div className="text-[10px] text-muted mb-0.5">{when(c.createdAt)}{c.resolved ? " · 해결됨" : ""}</div>
              <div className="text-[13px] whitespace-pre-wrap break-words">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1 rounded-lg border px-2 py-1 focus-within:border-accent transition-colors">
        <input className="flex-1 min-w-0 bg-transparent outline-none text-[13px] py-0.5" placeholder="코멘트 입력 후 Enter" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <button className="btn btn-icon text-muted hover:text-accent" title="등록 (Enter)" disabled={!text.trim() || busy} onClick={() => void send()}>
          {busy ? <Spinner className="w-3.5 h-3.5" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
