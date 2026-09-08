"use client";
import clsx from "clsx";
import { Check, Sparkles, X } from "lucide-react";
import type { Page } from "@/lib/types";
import type { IaProposal, ProposedPage, SpecRef } from "./types";

interface Props {
  proposal: IaProposal;
  pages: Page[];
  specs: SpecRef[];
  onChange: (p: IaProposal) => void;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}

function countChecked(list: ProposedPage[]): number { return list.reduce((n, p) => n + (p.checked ? 1 : 0) + countChecked(p.children), 0); }
function setAll(list: ProposedPage[], v: boolean): ProposedPage[] { return list.map((p) => ({ ...p, checked: v, children: setAll(p.children, v) })); }
function toggle(list: ProposedPage[], key: string): ProposedPage[] {
  return list.map((p) => (p.key === key ? { ...p, checked: !p.checked, children: p.checked ? setAll(p.children, false) : p.children } : { ...p, children: toggle(p.children, key) }));
}

export function IaProposals({ proposal, pages, specs, onChange, onAccept, onReject, busy }: Props) {
  const parent = proposal.kind === "tree" && proposal.parentId ? pages.find((p) => p.id === proposal.parentId) : undefined;
  const n = proposal.kind === "tree" ? countChecked(proposal.pages)
    : proposal.kind === "link" ? proposal.links.filter((l) => l.checked).length
    : proposal.updates.filter((u) => u.checked).length;
  const total = proposal.kind === "tree" ? countChecked(setAll(proposal.pages, true))
    : proposal.kind === "link" ? proposal.links.length
    : proposal.updates.length;
  const setAllChecked = (v: boolean): IaProposal =>
    proposal.kind === "tree" ? { ...proposal, pages: setAll(proposal.pages, v) }
    : proposal.kind === "link" ? { ...proposal, links: proposal.links.map((l) => ({ ...l, checked: v })) }
    : { ...proposal, updates: proposal.updates.map((u) => ({ ...u, checked: v })) };

  return (
    <div className="w-[360px] shrink-0 border-l bg-panel flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b flex items-center gap-2">
        <Sparkles size={13} className="text-accent" />
        <div className="text-sm font-medium flex-1 truncate">
          매니 제안 · {proposal.kind === "enrich" ? "설명 보강" : proposal.kind === "link" ? "상세기능 연결" : parent ? `"${parent.name}" 하위 페이지` : "정보구조도"}
        </div>
        <button className="btn btn-icon text-muted" onClick={onReject}><X size={14} /></button>
      </div>
      <div className="px-4 py-2 text-[11px] text-muted border-b flex items-center gap-2">
        {n}/{total} 선택
        <button className="underline ml-auto" onClick={() => onChange(setAllChecked(true))}>전체 선택</button>
        <button className="underline" onClick={() => onChange(setAllChecked(false))}>전체 해제</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {proposal.kind === "tree" ? (
          <Tree list={proposal.pages} depth={0} onToggle={(k) => onChange({ ...proposal, pages: toggle(proposal.pages, k) })} />
        ) : proposal.kind === "link" ? (
          proposal.links.map((l) => {
            const pg = pages.find((p) => p.id === l.pageId);
            return (
              <label key={l.pageId} className={clsx("flex gap-2 items-start px-2 py-2 rounded-md cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.04]", !l.checked && "opacity-60")}>
                <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={l.checked}
                  onChange={() => onChange({ ...proposal, links: proposal.links.map((x) => (x.pageId === l.pageId ? { ...x, checked: !x.checked } : x)) })} />
                <div className="min-w-0 text-xs">
                  <div className="font-medium">{pg?.name ?? "(삭제된 페이지)"}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {l.specIds.map((sid) => (
                      <span key={sid} className="chip !py-0 !text-[10px] bg-accent-soft text-accent border-transparent">{specs.find((s) => s.id === sid)?.title ?? sid}</span>
                    ))}
                  </div>
                </div>
              </label>
            );
          })
        ) : (
          proposal.updates.map((u) => {
            const cur = pages.find((p) => p.id === u.id);
            return (
              <label key={u.id} className={clsx("flex gap-2 items-start px-2 py-2 rounded-md cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.04]", !u.checked && "opacity-60")}>
                <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={u.checked} onChange={() => onChange({ ...proposal, updates: proposal.updates.map((x) => (x.id === u.id ? { ...x, checked: !x.checked } : x)) })} />
                <div className="min-w-0 text-xs">
                  <div className="font-medium">
                    {cur && cur.name !== u.name ? <><span className="line-through text-muted mr-1">{cur.name}</span>{u.name}</> : u.name}
                  </div>
                  {cur?.description && cur.description !== u.description && <div className="text-muted line-through line-clamp-2 mt-0.5">{cur.description}</div>}
                  <div className="text-fg/90 mt-0.5 whitespace-pre-wrap">{u.description}</div>
                </div>
              </label>
            );
          })
        )}
      </div>
      <div className="border-t p-3 flex gap-2">
        <button className="btn btn-sm btn-primary flex-1" disabled={busy || n === 0} onClick={onAccept}><Check size={12} /> 선택 반영 ({n})</button>
        <button className="btn btn-sm" disabled={busy} onClick={onReject}><X size={12} /> 거절</button>
      </div>
    </div>
  );
}

function Tree({ list, depth, onToggle }: { list: ProposedPage[]; depth: number; onToggle: (key: string) => void }) {
  return (
    <>
      {list.map((p) => (
        <div key={p.key}>
          <label style={{ paddingLeft: 8 + depth * 16 }} className={clsx("flex gap-2 items-start pr-2 py-1.5 rounded-md cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.04]", !p.checked && "opacity-60")}>
            <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={p.checked} onChange={() => onToggle(p.key)} />
            <div className="min-w-0 text-xs">
              <div className="font-medium">{p.name}</div>
              {p.description && <div className="text-muted mt-0.5 line-clamp-2">{p.description}</div>}
            </div>
          </label>
          {p.children.length > 0 && <Tree list={p.children} depth={depth + 1} onToggle={onToggle} />}
        </div>
      ))}
    </>
  );
}
