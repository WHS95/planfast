"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, Plus, History, Trash2, Paperclip, ArrowUp, X, AtSign, Check, Loader2, Clock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import type { Chat, ChatMessage, Project } from "@/lib/types";
import { api } from "@/lib/api";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { Markdown } from "@/components/manny/Markdown";
import { StreamingReply } from "@/components/manny/StreamingReply";
import { ProposalCard } from "@/components/manny/ProposalCard";
import { MentionPicker, type MentionChip, type MentionIndex } from "@/components/manny/MentionPicker";
import { useDialog } from "@/components/ui/DialogProvider";

type ChatRow = Chat & { messageCount: number; pendingProposals: number };
type Att = { id: string; name: string; size: number };
/** 전송 대기열 항목 — chatId 를 함께 들고 다녀야 대화를 바꿔도 엉뚱한 방으로 안 간다 */
type Queued = { key: string; content: string; mentions: MentionChip[]; attachmentIds: string[]; chatId: string };

const QUICK = ["PRD 검토해줘", "기능 누락 찾아줘", "요구사항 요약"];
const POLL_MS = 700;

/** 서버 목록을 정본으로 받되, 아직 서버에 없는 낙관적(tmp-) 메시지는 뒤에 남긴다 */
const applyServer = (server: ChatMessage[]) => (prev: ChatMessage[]) => {
  const ids = new Set(server.map((m) => m.id));
  return [...server, ...prev.filter((m) => m.id.startsWith("tmp-") && !ids.has(m.id))];
};

export function MannyPanel({ project }: { project: Project }) {
  const { confirm } = useDialog();
  const pid = project.id;
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { pendingMention, consumeMention, refresh, tick } = useEditor();

  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
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

  // 생성 중인 메시지가 하나라도 있으면 폴링한다. since 는 가장 오래된 스트리밍 메시지 기준.
  const streaming = useMemo(() => messages.filter((m) => m.status === "streaming"), [messages]);
  const streamingCount = streaming.length;

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

  // 활성 대화가 바뀌거나 다른 패널이 데이터를 바꿨을 때(tick) 다시 읽는다.
  // 프로젝트를 나갔다 돌아와도 여기서 "streaming" 상태를 받아 폴링이 자동으로 이어진다.
  useEffect(() => {
    if (!chatId || sending) return;
    let alive = true;
    api<{ chat: Chat; messages: ChatMessage[] }>(`/api/projects/${pid}/chat/${chatId}`)
      .then((r) => { if (alive) setMessages(applyServer(r.messages)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [chatId, tick, sending, pid]);

  // 생성 중일 때만 700ms 폴링. 스트리밍이 끝나면(streamingCount → 0) 저절로 멈춘다.
  useEffect(() => {
    if (!chatId || streamingCount === 0) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const r = await api<{ chat: Chat; messages: ChatMessage[] }>(`/api/projects/${pid}/chat/${chatId}`);
        if (!alive) return;
        setMessages(applyServer(r.messages));
      } catch { /* 폴링 실패는 조용히 넘기고 다음 주기에 재시도 */ }
      if (alive) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [chatId, pid, streamingCount]);

  // 답변이 끝나면 대화 목록(대기 제안 수)과 문서 뷰를 한 번 새로고침
  useEffect(() => {
    if (streamingCount > 0) return;
    const t = setTimeout(() => { loadChats().catch(() => {}); }, 0);
    return () => clearTimeout(t);
  }, [streamingCount, loadChats]);

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

  // 새 메시지가 붙으면 맨 아래로. 타이핑 중에는(폴링 주기 사이) 아래에 붙어 있을 때만 따라간다.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length]);
  useEffect(() => {
    if (streamingCount === 0) return;
    const t = setInterval(() => {
      const el = listRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight });
    }, 300);
    return () => clearInterval(t);
  }, [streamingCount]);

  /** POST 는 즉시 돌아온다(201). 실제 생성은 서버 백그라운드 잡이 계속한다. */
  const send = useCallback(async (opts: { content: string; mentions?: MentionChip[]; attachmentIds?: string[]; kickoff?: "ask" | "files"; chatId?: string }) => {
    let id = opts.chatId ?? chatId;
    if (!id) { const c = await api<Chat>(`/api/projects/${pid}/chat`, { method: "POST", json: {} }); id = c.id; setChatId(id); }
    setSending(true); setError(null);
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
      loadChats().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
      setMessages((ms) => ms.filter((m) => !m.id.startsWith("tmp-")));
    } finally { setSending(false); }
  }, [chatId, pid, atts, loadChats]);

  // 대기열 소진: 앞선 답변이 끝나면 다음 메시지를 자동 전송 (setTimeout 으로 이펙트 밖에서 setState)
  useEffect(() => {
    if (streamingCount > 0 || sending || queue.length === 0) return;
    const next = queue[0];
    const t = setTimeout(() => {
      setQueue((q) => q.filter((x) => x.key !== next.key));
      send({ content: next.content, mentions: next.mentions, attachmentIds: next.attachmentIds, chatId: next.chatId });
    }, 0);
    return () => clearTimeout(t);
  }, [streamingCount, sending, queue, send]);

  // kickoff from HomeComposer — 스트리밍 경로를 똑같이 탄다
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
    setChatId(c.id); setQueue([]); setShowHistory(false);
  }
  async function deleteChat(id: string) {
    if (!(await confirm({ message: "이 대화를 삭제할까요?", confirmLabel: "삭제", danger: true }))) return;
    await api(`/api/projects/${pid}/chat/${id}`, { method: "DELETE" });
    const list = await loadChats();
    setQueue((q) => q.filter((x) => x.chatId !== id));
    if (chatId === id) setChatId(list[0]?.id ?? null);
  }
  function selectChat(id: string) {
    setChatId(id); setQueue([]); setShowHistory(false);
  }

  /** 답변을 기다리는 중이어도 막지 않는다: 진행 중이면 대기열에 쌓고 순서대로 보낸다. */
  function submit() {
    const content = text.trim();
    if (!content && !atts.length) return;
    const m = mentions; const a = atts.map((x) => x.id);
    const body = { content: content || "첨부 자료를 검토해줘", mentions: m, attachmentIds: a };
    setText(""); setMentions([]); setAtts([]); setPicker(null);
    if (streamingCount > 0 || sending || queue.length > 0) {
      if (chatId) setQueue((q) => [...q, { key: `q-${Date.now()}-${q.length}`, chatId, ...body }]);
      else send(body);
    } else send(body);
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
      loadChats().catch(() => {});
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
  const empty = messages.length === 0;
  const working = streamingCount > 0 || sending;

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
              <div key={c.id} className={clsx("flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/[.03] cursor-pointer", c.id === chatId && "bg-accent-soft/60")} onClick={() => selectChat(c.id)}>
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
            <div className={clsx("max-w-[92%] rounded-lg px-3 py-2",
              m.role === "user" ? "bg-accent text-white" : m.status === "error" ? "border border-danger/30 bg-danger/[.06]" : "bg-black/[.04] dark:bg-white/[.06]")}>
              {(m.mentions.length > 0 || m.attachments.length > 0) && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {m.mentions.map((x) => <span key={`${x.type}:${x.id}`} className="chip border-white/30 bg-white/15 text-[10px]"><AtSign size={9} />{x.label}</span>)}
                  {m.attachments.map((a) => <span key={a.id} className="chip border-white/30 bg-white/15 text-[10px]"><Paperclip size={9} />{a.name}</span>)}
                </div>
              )}
              {m.role === "user"
                ? <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                : m.status === "error"
                  ? <Markdown text={m.content} />
                  : <StreamingReply content={m.content} streaming={m.status === "streaming"} />}
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
                  <AnimatePresence initial={false}>
                    {m.proposals.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(i, 6) * 0.03 }}
                      >
                        <ProposalCard proposal={p} busy={applying !== null} onApply={() => proposalAction(m.id, p.id, "apply")} onReject={() => proposalAction(m.id, p.id, "reject")} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        ))}
        {error && <div className="text-xs text-danger whitespace-pre-wrap border border-danger/30 rounded-md p-2 flex gap-2"><span className="flex-1">{error}</span><button onClick={() => setError(null)}><X size={12} /></button></div>}
      </div>

      {/* composer — 생성 중에도 잠기지 않는다 */}
      <div className="border-t p-3 shrink-0">
        {empty && (
          <div className="flex flex-wrap gap-1 mb-2">
            {QUICK.map((q) => <button key={q} className="chip hover:bg-accent-soft hover:text-accent cursor-pointer" onClick={() => send({ content: q })}>{q}</button>)}
          </div>
        )}
        <AnimatePresence initial={false}>
          {queue.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="mb-2 space-y-1">
              {queue.map((q) => (
                <div key={q.key} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Clock size={11} /><span className="truncate flex-1">{q.content}</span>
                  <button className="btn btn-icon" onClick={() => setQueue((cur) => cur.filter((x) => x.key !== q.key))}><X size={11} /></button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
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
          {/* field-sizing:content 로 내용만큼 자란다(globals.css). 여기서 10줄쯤에서 스크롤로 넘긴다 */}
          <textarea
            ref={taRef}
            rows={1}
            className="input text-sm !max-h-56"
            placeholder={working ? "이어서 보낼 메시지… (⌘/Ctrl+Enter)" : "매니에게 메시지… (@로 대상 지목, ⌘/Ctrl+Enter 전송)"}
            value={text}
            onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => { if (picker) return; if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            onBlur={() => setTimeout(() => setPicker(null), 150)}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.json,.hwp,.hwpx,.xlsx" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
            <button className="btn btn-ghost btn-sm text-muted" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} 첨부</button>
            <button className="btn btn-ghost btn-sm text-muted" onClick={() => { const v = text + (text && !/\s$/.test(text) ? " " : "") + "@"; onTextChange(v, v.length); setTimeout(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(v.length, v.length); }, 0); }}><AtSign size={13} /> 멘션</button>
          </div>
          <button className="btn btn-primary rounded-full !p-2 relative" disabled={!text.trim() && !atts.length} onClick={submit} title={working ? "대기열에 추가" : "전송"}>
            <ArrowUp size={14} />
            {working && <motion.span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white/90" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} />}
          </button>
        </div>
      </div>
    </div>
  );
}
