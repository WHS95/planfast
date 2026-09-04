"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, Plus, History, Trash2, Paperclip, ArrowUp, X, AtSign, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { Chat, ChatMessage, Project } from "@/lib/types";
import { api } from "@/lib/api";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Markdown } from "@/components/manny/Markdown";
import { ProposalCard } from "@/components/manny/ProposalCard";
import { MentionPicker, type MentionChip, type MentionIndex } from "@/components/manny/MentionPicker";

type ChatRow = Chat & { messageCount: number; pendingProposals: number };
type Att = { id: string; name: string; size: number };
const PHASES = ["문서 읽는 중…", "생각하는 중…", "작성 중…"];
const QUICK = ["PRD 검토해줘", "기능 누락 찾아줘", "요구사항 요약"];

export function MannyPanel({ project }: { project: Project }) {
  const pid = project.id;
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { pendingMention, consumeMention, refresh, tick } = useEditor();

  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<MentionChip[]>([]);
  const [atts, setAtts] = useState<Att[]>([]);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState<{ start: number } | null>(null);
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState<MentionIndex | null>(null);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const kickoffDone = useRef(false);

  const loadChats = useCallback(async () => {
    const list = await api<ChatRow[]>(`/api/projects/${pid}/chat`);
    setChats(list);
    return list;
  }, [pid]);

  // initial: chats → select most recent (or ?chat=)
  useEffect(() => {
    let alive = true;
    api<ChatRow[]>(`/api/projects/${pid}/chat`).then((list) => {
      if (!alive) return;
      setChats(list);
      const want = sp.get("chat");
      const pick = (want && list.find((c) => c.id === want)?.id) || list[0]?.id || null;
      setChatId(pick);
      if (!list.length) setMessages([]);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);
  // refetch messages when the active chat changes, or another panel/tab mutated data (tick), unless a send is in flight
  useEffect(() => {
    if (!chatId || busy) return;
    api<{ chat: Chat; messages: ChatMessage[] }>(`/api/projects/${pid}/chat/${chatId}`).then((r) => setMessages(r.messages));
  }, [chatId, tick, busy, pid]);

  // pending mention from tabs
  useEffect(() => {
    if (!pendingMention) return;
    const m = pendingMention as MentionChip;
    Promise.resolve().then(() => {
      setMentions((ms) => (ms.some((x) => x.type === m.type && x.id === m.id) ? ms : [...ms, m]));
      consumeMention();
      setTimeout(() => taRef.current?.focus(), 50);
    });
  }, [pendingMention, consumeMention]);

  // busy phases: reset to 0 whenever a send starts (in `send`), advance on an interval while busy
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 6000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, busy]);

  const send = useCallback(async (opts: { content: string; mentions?: MentionChip[]; attachmentIds?: string[]; kickoff?: "ask" | "files"; chatId?: string }) => {
    let id = opts.chatId ?? chatId;
    if (!id) { const c = await api<Chat>(`/api/projects/${pid}/chat`, { method: "POST", json: {} }); id = c.id; setChatId(id); }
    setBusy(true); setError(null); setPhase(0);
    const optimistic: ChatMessage | null = opts.kickoff === "ask" ? null : {
      id: "tmp-" + Date.now(), chatId: id, role: "user", content: opts.content, mentions: opts.mentions ?? [],
      attachments: (opts.attachmentIds ?? []).map((aid) => ({ id: aid, name: atts.find((a) => a.id === aid)?.name ?? "파일", mime: "", size: 0, text: "" })), proposals: [], status: "done", createdAt: new Date().toISOString(),
    };
    if (optimistic) setMessages((ms) => [...ms, optimistic]);
    try {
      const r = await api<{ user: ChatMessage | null; assistant: ChatMessage }>(`/api/projects/${pid}/chat/${id}/send`, {
        method: "POST", json: { content: opts.content, mentions: opts.mentions ?? [], attachmentIds: opts.attachmentIds ?? [], kickoff: opts.kickoff ?? null },
      });
      setMessages((ms) => [...ms.filter((m) => !m.id.startsWith("tmp-")), ...(r.user ? [r.user] : []), r.assistant]);
      loadChats();
    } catch (e) {
      setError((e as Error).message);
      setMessages((ms) => ms.filter((m) => !m.id.startsWith("tmp-")));
    } finally { setBusy(false); }
  }, [chatId, pid, atts, loadChats]);

  // kickoff from HomeComposer
  useEffect(() => {
    const kickoff = sp.get("kickoff") as "ask" | "files" | null;
    if (!kickoff || kickoffDone.current || chats === null) return;
    kickoffDone.current = true;
    const seed = sp.get("seed") ?? project.description ?? "";
    router.replace(path);
    if (chats.length > 0) return;
    (async () => {
      const c = await api<Chat>(`/api/projects/${pid}/chat`, { method: "POST", json: { title: kickoff === "ask" ? "아이디어 구체화" : "자료 기반 PRD 초안" } });
      setChatId(c.id);
      if (kickoff === "ask") await send({ content: seed || project.title, kickoff: "ask", chatId: c.id });
      else await send({ content: "첨부 자료를 바탕으로 PRD 초안을 제안해줘" + (seed ? `\n\n보충 설명: ${seed}` : ""), kickoff: "files", chatId: c.id });
    })();
  }, [chats, sp, pid, path, router, project.description, project.title, send]);

  async function newChat() {
    const c = await api<Chat>(`/api/projects/${pid}/chat`, { method: "POST", json: {} });
    await loadChats();
    setChatId(c.id); setShowHistory(false);
  }
  async function deleteChat(id: string) {
    if (!confirm("이 대화를 삭제할까요?")) return;
    await api(`/api/projects/${pid}/chat/${id}`, { method: "DELETE" });
    const list = await loadChats();
    if (chatId === id) setChatId(list[0]?.id ?? null);
  }

  function submit() {
    const content = text.trim();
    if (!content && !atts.length) return;
    if (busy) return;
    const m = mentions; const a = atts.map((x) => x.id);
    setText(""); setMentions([]); setAtts([]); setPicker(null);
    send({ content: content || "첨부 자료를 검토해줘", mentions: m, attachmentIds: a });
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const r = await api<Att[]>(`/api/projects/${pid}/attachments`, { method: "POST", body: fd });
      setAtts((as) => [...as, ...r.map((x) => ({ id: x.id, name: x.name, size: x.size }))]);
    } catch (e) { setError((e as Error).message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function proposalAction(messageId: string, proposalId: string | undefined, action: "apply" | "reject" | "applyAll") {
    if (!chatId) return;
    setApplying(proposalId ?? messageId);
    try {
      const r = await api<{ message: ChatMessage; errors: string[] }>(`/api/projects/${pid}/chat/${chatId}/proposals`, { method: "POST", json: { messageId, proposalId, action } });
      setMessages((ms) => ms.map((m) => (m.id === messageId ? r.message : m)));
      if (r.errors.length) setError(r.errors.join("\n"));
      if (action !== "reject") { refresh(); broadcastChange(pid); }
      loadChats();
    } catch (e) { setError((e as Error).message); } finally { setApplying(null); }
  }

  // composer: detect "@"; `pos` defaults to end-of-text (used for the toolbar "멘션" button, which appends "@")
  function onTextChange(v: string, pos: number = v.length) {
    setText(v);
    setCaret(pos);
    const before = v.slice(0, pos);
    const at = before.lastIndexOf("@");
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1])) && !/\s/.test(before.slice(at + 1))) {
      setPicker({ start: at });
      if (!index) api<MentionIndex>(`/api/projects/${pid}/chat?index=1`).then(setIndex).catch(() => {});
    } else setPicker(null);
  }
  function pickMention(m: MentionChip) {
    setMentions((ms) => (ms.some((x) => x.type === m.type && x.id === m.id) ? ms : [...ms, m]));
    if (picker) setText(text.slice(0, picker.start) + text.slice(caret));
    setPicker(null);
    setTimeout(() => taRef.current?.focus(), 0);
  }
  const pickerQuery = picker ? text.slice(picker.start + 1, caret) : "";

  const current = chats?.find((c) => c.id === chatId);
  const empty = messages.length === 0 && !busy;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* header */}
      <div className="h-11 border-b flex items-center px-3 gap-1 shrink-0 relative">
        <Bot size={15} className="text-accent" />
        <span className="text-sm font-medium truncate flex-1">{current?.title ?? "매니"}</span>
        <button className="btn btn-ghost btn-sm" onClick={newChat} title="새 채팅"><Plus size={14} /> 새 채팅</button>
        <button className={clsx("btn btn-icon", showHistory && "bg-accent-soft text-accent")} onClick={() => setShowHistory((s) => !s)} title="대화 기록"><History size={15} /></button>
        {showHistory && (
          <div className="absolute right-2 top-10 card shadow-lg z-30 w-72 max-h-80 overflow-y-auto py-1" onMouseLeave={() => setShowHistory(false)}>
            {!chats?.length && <div className="px-3 py-2 text-xs text-muted">대화가 없습니다</div>}
            {chats?.map((c) => (
              <div key={c.id} className={clsx("flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/[.03] cursor-pointer", c.id === chatId && "bg-accent-soft/60")} onClick={() => { setChatId(c.id); setShowHistory(false); }}>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{c.title}</div>
                  <div className="text-[10px] text-muted">{new Date(c.createdAt).toLocaleString("ko-KR")} · 메시지 {c.messageCount}{c.pendingProposals ? ` · 제안 ${c.pendingProposals}건 대기` : ""}</div>
                </div>
                <button className="btn btn-icon text-muted" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {empty && (
          <div className="text-xs text-muted text-center py-8 space-y-2">
            <Bot size={28} className="mx-auto text-accent/60" />
            <div>매니에게 기획을 물어보거나 문서 변경을 요청하세요.<br />@ 로 PRD·기능·플로우를 지목할 수 있어요.</div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[92%] rounded-lg px-3 py-2", m.role === "user" ? "bg-accent text-white" : "bg-black/[.04] dark:bg-white/[.06]")}>
              {(m.mentions.length > 0 || m.attachments.length > 0) && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {m.mentions.map((x) => <span key={`${x.type}:${x.id}`} className="chip border-white/30 bg-white/15 text-[10px]"><AtSign size={9} />{x.label}</span>)}
                  {m.attachments.map((a) => <span key={a.id} className="chip border-white/30 bg-white/15 text-[10px]"><Paperclip size={9} />{a.name}</span>)}
                </div>
              )}
              {m.role === "user" ? <div className="text-sm whitespace-pre-wrap">{m.content}</div> : <Markdown text={m.content} />}
              {m.proposals.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>제안 {m.proposals.length}건 · 대기 {m.proposals.filter((p) => p.status === "pending").length}</span>
                    {m.proposals.some((p) => p.status === "pending") && (
                      <button className="btn btn-sm btn-primary" disabled={applying !== null} onClick={() => proposalAction(m.id, undefined, "applyAll")}>
                        {applying === m.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 모두 반영
                      </button>
                    )}
                  </div>
                  {m.proposals.map((p) => (
                    <ProposalCard key={p.id} proposal={p} busy={applying !== null} onApply={() => proposalAction(m.id, p.id, "apply")} onReject={() => proposalAction(m.id, p.id, "reject")} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-black/[.04] dark:bg-white/[.06] text-xs text-muted flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-accent" /> {PHASES[phase]}
            </div>
          </div>
        )}
        {error && <div className="text-xs text-danger whitespace-pre-wrap border border-danger/30 rounded-md p-2 flex gap-2"><span className="flex-1">{error}</span><button onClick={() => setError(null)}><X size={12} /></button></div>}
      </div>

      {/* composer */}
      <div className="border-t p-3 shrink-0">
        {empty && (
          <div className="flex flex-wrap gap-1 mb-2">
            {QUICK.map((q) => <button key={q} className="chip hover:bg-accent-soft hover:text-accent cursor-pointer" onClick={() => send({ content: q })}>{q}</button>)}
          </div>
        )}
        {(mentions.length > 0 || atts.length > 0) && (
          <div className="flex flex-wrap gap-1 mb-2">
            {mentions.map((m) => (
              <span key={`${m.type}:${m.id}`} className="chip bg-accent-soft text-accent border-transparent"><AtSign size={10} />{m.label}<button onClick={() => setMentions(mentions.filter((x) => x !== m))}><X size={11} /></button></span>
            ))}
            {atts.map((a) => (
              <span key={a.id} className="chip"><Paperclip size={10} />{a.name}<button onClick={() => setAtts(atts.filter((x) => x.id !== a.id))}><X size={11} /></button></span>
            ))}
          </div>
        )}
        <div className="relative">
          {picker && <MentionPicker index={index} query={pickerQuery} onPick={pickMention} onClose={() => setPicker(null)} />}
          <textarea
            ref={taRef}
            className="input resize-none min-h-[64px] max-h-40 text-sm"
            placeholder="매니에게 메시지… (@로 대상 지목, ⌘/Ctrl+Enter 전송)"
            value={text}
            disabled={busy}
            onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => { if (picker) return; if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            onBlur={() => setTimeout(() => setPicker(null), 150)}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.json,.hwp,.hwpx,.xlsx" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
            <button className="btn btn-ghost btn-sm text-muted" disabled={uploading || busy} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} 첨부</button>
            <button className="btn btn-ghost btn-sm text-muted" disabled={busy} onClick={() => { const v = text + (text && !/\s$/.test(text) ? " " : "") + "@"; onTextChange(v, v.length); setTimeout(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(v.length, v.length); }, 0); }}><AtSign size={13} /> 멘션</button>
          </div>
          <button className="btn btn-primary rounded-full !p-2" disabled={busy || (!text.trim() && !atts.length)} onClick={submit}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
