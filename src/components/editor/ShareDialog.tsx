"use client";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Copy, ExternalLink, Link2, Trash2, TriangleAlert } from "lucide-react";
import type { Project, ShareLink } from "@/lib/types";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Empty, Spinner } from "@/components/ui";
import { useDialog } from "@/components/ui/DialogProvider";

type Expiry = "never" | "7" | "30" | "custom";
const EXPIRY: { key: Expiry; label: string }[] = [{ key: "never", label: "무기한" }, { key: "7", label: "7일" }, { key: "30", label: "30일" }, { key: "custom", label: "직접 입력" }];
const fmtDate = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function ShareDialog({ project, onClose }: { project: Project; current?: string; onClose: () => void }) {
  const { confirm } = useDialog();
  const [list, setList] = useState<ShareLink[] | null>(null);
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const base = `/api/projects/${project.id}/share`;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3456";
  const urlOf = (l: ShareLink) => `${origin}/share/${l.id}`;

  const load = useCallback(() => api<ShareLink[]>(base).then(setList).catch((e) => setErr(e.message)), [base]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const json = expiry === "custom" ? { expiresAt: date ? new Date(date + "T23:59:59").toISOString() : null } : { expiresInDays: expiry === "never" ? null : Number(expiry) };
      if (expiry === "custom" && !date) throw new Error("만료일을 입력하세요");
      const l = await api<ShareLink>(base, { method: "POST", json });
      await load(); copy(l);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function copy(l: ShareLink) { try { await navigator.clipboard.writeText(urlOf(l)); setCopied(l.id); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ } }
  async function toggle(l: ShareLink) { await api(`${base}/${l.id}`, { method: "PATCH", json: { disabled: !l.disabled } }); await load(); }
  async function remove(l: ShareLink) { if (!(await confirm({ message: "링크를 삭제할까요?\n이 링크로는 더 이상 열 수 없어요.", confirmLabel: "삭제", danger: true }))) return; await api(`${base}/${l.id}`, { method: "DELETE" }); await load(); }
  const expired = (l: ShareLink) => !!l.expiresAt && new Date(l.expiresAt) < new Date();

  return (
    <Dialog title="링크 공유" onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-medium">새 링크 만들기</div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {EXPIRY.map((e) => <button key={e.key} onClick={() => setExpiry(e.key)} className={clsx("chip cursor-pointer", expiry === e.key ? "bg-accent-soft text-accent border-transparent" : "text-muted hover:text-fg")}>{e.label}</button>)}
            {expiry === "custom" && <input type="date" className="input !w-auto !py-1 text-xs" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}
            <button className="btn btn-primary btn-sm ml-auto" onClick={create} disabled={busy}>{busy ? <Spinner /> : <Link2 size={13} />} 링크 생성</button>
          </div>
          {err && <div className="text-xs text-danger">{err}</div>}
          <div className="flex items-start gap-2 text-xs text-warn bg-warn-soft rounded-md p-2.5">
            <TriangleAlert size={14} className="shrink-0 mt-0.5" />
            <span>링크를 가진 누구나 이 프로젝트의 PRD·기능명세서·정보구조도·유저플로우·와이어프레임을 읽기 전용으로 열람할 수 있어요. 외부에 공유할 땐 만료일을 설정하고, 필요 없어지면 비활성화하세요.</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">기존 링크</div>
          {list === null ? <div className="py-4 text-center"><Spinner className="text-muted" /></div> : list.length === 0 ? <Empty>아직 공유 링크가 없어요</Empty> : (
            <ul className="space-y-2">
              {list.map((l) => (
                <li key={l.id} className={clsx("card p-3 space-y-2", (l.disabled || expired(l)) && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono truncate flex-1 bg-bg rounded px-2 py-1">{urlOf(l)}</code>
                    <button className="btn btn-icon" title="복사" onClick={() => copy(l)}>{copied === l.id ? <Check size={14} className="text-ok" /> : <Copy size={14} />}</button>
                    <a className="btn btn-icon" title="새 탭에서 열기" href={urlOf(l)} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{l.expiresAt ? `만료 ${fmtDate(l.expiresAt)}` : "무기한"}{expired(l) && " (만료됨)"}</span>
                    {l.disabled && <span className="chip">비활성</span>}
                    <span className="ml-auto flex gap-1">
                      <button className="btn btn-sm" onClick={() => toggle(l)}>{l.disabled ? "활성화" : "비활성화"}</button>
                      <button className="btn btn-sm text-danger" onClick={() => remove(l)}><Trash2 size={12} /></button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
