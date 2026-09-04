"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, ArrowUp, X, Loader2, MessageCircleQuestion, FileText } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

type Mode = "ask" | "files";

export function HomeComposer() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ask");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const p = await api<{ id: string }>("/api/projects", { method: "POST", json: { title: text.trim().slice(0, 40) || "새 프로젝트", description: text.trim() } });
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        await api(`/api/projects/${p.id}/attachments`, { method: "POST", body: fd });
      }
      // hand off to Manny: start a kickoff chat with the seed text
      const q = new URLSearchParams({ kickoff: mode, seed: text.trim() });
      router.push(`/p/${p.id}/prd?${q.toString()}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="card p-3 shadow-sm">
      <div className="flex gap-1 mb-2">
        <ModeBtn active={mode === "ask"} onClick={() => setMode("ask")} icon={<MessageCircleQuestion size={14} />}>AI 질문으로 시작</ModeBtn>
        <ModeBtn active={mode === "files"} onClick={() => setMode("files")} icon={<FileText size={14} />}>내 자료로 시작</ModeBtn>
      </div>
      <textarea
        className="w-full bg-transparent outline-none resize-none px-2 py-1 min-h-[88px]"
        placeholder={mode === "ask" ? "만들고 싶은 제품이나 서비스의 주제와 배경을 적어주세요. 예) 러닝 크루 기여도를 기록하고 월말 정산하는 앱" : "회의록·기존 기획 자료를 첨부하고, 보충 설명을 적어주세요. (PDF, DOCX, TXT, MD 최대 10개)"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {files.map((f, i) => (
            <span key={i} className="chip">{f.name}<button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} /></button></span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-1">
        <div>
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.json,.hwp,.hwpx,.xlsx" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> 파일 첨부</button>
        </div>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-danger">{err}</span>}
          <span className="text-xs text-muted hidden sm:inline"><span className="kbd">⌘</span> + <span className="kbd">Enter</span></span>
          <button className="btn btn-primary rounded-full !p-2" disabled={busy || (!text.trim() && !files.length)} onClick={submit}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
function ModeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={clsx("btn btn-sm", active ? "bg-accent-soft text-accent border-accent/30" : "btn-ghost text-muted")}>{icon}{children}</button>;
}
