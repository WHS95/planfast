"use client";
import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import type { ApiKey } from "@/lib/types";
import { api } from "@/lib/api";
import { Empty, Spinner } from "@/components/ui";

const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function McpSettings({ initialKeys, initialAllow, tools }: { initialKeys: ApiKey[]; initialAllow: boolean; tools: { name: string; desc: string }[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [allow, setAllow] = useState(initialAllow);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<ApiKey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3456";
  const url = `${origin}/api/mcp`;
  const keyPlaceholder = fresh?.key ?? "<API 키>";

  async function reload() { const r = await api<{ keys: ApiKey[]; allowLocalNoAuth: boolean }>("/api/keys"); setKeys(r.keys); setAllow(r.allowLocalNoAuth); }
  async function create() {
    setBusy(true); setErr(null);
    try { const k = await api<ApiKey>("/api/keys", { method: "POST", json: { name: name || "새 키" } }); setFresh(k); setName(""); await reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(k: ApiKey) { if (!confirm(`"${k.name}" 키를 삭제할까요? 이 키를 쓰는 도구는 즉시 연결이 끊겨요.`)) return; await api(`/api/keys/${k.id}`, { method: "DELETE" }); if (fresh?.id === k.id) setFresh(null); await reload(); }
  async function toggleAllow() { const v = !allow; setAllow(v); await api("/api/keys", { method: "POST", json: { allowLocalNoAuth: v } }); }

  const claudeCmd = `claude mcp add --transport http --scope user planfast ${url} --header "Authorization: Bearer ${keyPlaceholder}"`;
  const claudeCmdNoAuth = `claude mcp add --transport http --scope user planfast ${url}`;
  const cursorJson = JSON.stringify({ mcpServers: { planfast: { url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
  const genericJson = JSON.stringify({ planfast: { type: "http", url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } }, null, 2);

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-4">
        <h2 className="font-medium flex items-center gap-2"><KeyRound size={15} /> API 키</h2>
        {fresh && (
          <div className="rounded-md border border-accent bg-accent-soft p-3 space-y-2">
            <div className="text-sm font-medium">새 키가 만들어졌어요 — 지금만 볼 수 있어요</div>
            <div className="text-xs text-muted">이 창을 벗어나면 다시 표시되지 않아요. 안전한 곳에 복사해 두세요.</div>
            <CopyBox text={fresh.key} mono />
          </div>
        )}
        <div className="flex gap-1.5">
          <input className="input" placeholder="키 이름 (예: Claude Code, Cursor)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && create()} />
          <button className="btn btn-primary shrink-0" onClick={create} disabled={busy}>{busy ? <Spinner /> : <Plus size={14} />} API 키 생성</button>
        </div>
        {err && <div className="text-xs text-danger">{err}</div>}
        {keys.length === 0 ? <Empty>아직 API 키가 없어요</Empty> : (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="py-2.5 flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{k.name}</div>
                  <div className="text-xs text-muted font-mono">{k.key}</div>
                </div>
                <div className="text-xs text-muted text-right shrink-0">
                  <div>생성 {fmt(k.createdAt)}</div>
                  <div>{k.lastUsedAt ? `최근 사용 ${fmt(k.lastUsedAt)}` : "사용 기록 없음"}</div>
                </div>
                <button className="btn btn-icon text-danger" title="삭제" onClick={() => remove(k)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-3 text-sm cursor-pointer pt-2 border-t">
          <input type="checkbox" className="mt-1" checked={allow} onChange={toggleAllow} />
          <span>
            <span className="font-medium">localhost 무인증 허용</span>
            <span className="block text-xs text-muted">이 Mac에서 localhost/127.0.0.1로 들어오는 MCP 요청은 API 키 없이 허용해요. 끄면 모든 요청에 키가 필요해요.</span>
          </span>
        </label>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="font-medium">연결 설정</h2>
        <div className="text-xs text-muted">엔드포인트: <code className="font-mono">{url}</code> (Streamable HTTP, stateless){!fresh && " · 아래 스니펫의 <API 키> 자리에 발급한 키를 넣으세요."}</div>
        <Snippet title="Claude Code" text={claudeCmd} />
        {allow && <Snippet title="Claude Code (localhost 무인증)" text={claudeCmdNoAuth} />}
        <Snippet title="Cursor · ~/.cursor/mcp.json" text={cursorJson} />
        <Snippet title="일반 (JSON)" text={genericJson} />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-medium">제공 도구</h2>
        <ul className="text-sm grid grid-cols-1 gap-1.5">
          {tools.map((t) => <li key={t.name} className="flex gap-3"><code className="font-mono text-xs bg-bg rounded px-1.5 py-0.5 shrink-0 h-fit">{t.name}</code><span className="text-muted">{t.desc}</span></li>)}
        </ul>
        <div className="text-xs text-muted">리소스: <code className="font-mono">planfast://project/{"{id}"}</code> — 프로젝트 전체 컨텍스트 마크다운</div>
      </section>
    </div>
  );
}

function Snippet({ title, text }: { title: string; text: string }) {
  return <div className="space-y-1"><div className="text-xs font-medium text-muted">{title}</div><CopyBox text={text} mono /></div>;
}
function CopyBox({ text, mono }: { text: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }
  return (
    <div className="relative">
      <pre className={`text-xs bg-bg border rounded-md p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all ${mono ? "font-mono" : ""}`}>{text}</pre>
      <button className="btn btn-icon absolute top-1.5 right-1.5" title="복사" onClick={copy}>{ok ? <Check size={14} className="text-ok" /> : <Copy size={14} />}</button>
    </div>
  );
}
