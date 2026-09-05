"use client";
import clsx from "clsx";
import { FLOW_NODE_LABEL, FLOW_NODE_TYPES, type FlowNodeType } from "@/lib/types";

/** 레퍼런스의 우상단 범례: 노드 모양 + 이름, 마지막에 흐름 화살표 */
function Shape({ kind }: { kind: FlowNodeType }) {
  if (kind === "start") return <i className="w-3.5 h-3.5 rounded-full bg-[var(--fg)] shrink-0" />;
  if (kind === "page") return <i className="w-4 h-3 rounded-[3px] border border-violet-300 bg-violet-100 dark:border-violet-500/50 dark:bg-violet-500/25 shrink-0" />;
  if (kind === "data") return <i className="w-4 h-3 -skew-x-[18deg] rounded-[2px] border border-sky-300 bg-sky-100 dark:border-sky-500/50 dark:bg-sky-500/25 shrink-0" />;
  if (kind === "branch") return <i className="w-3 h-3 rotate-45 rounded-[2px] border border-amber-400 bg-amber-100 dark:border-amber-500/60 dark:bg-amber-500/25 shrink-0" />;
  return <i className="w-4 h-3 rounded-full border bg-panel shrink-0" />;
}

export function FlowLegend({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5 rounded-lg border bg-panel/90 backdrop-blur px-2.5 py-1.5 shadow-sm text-[11px] text-muted", className)}>
      {FLOW_NODE_TYPES.map((t) => (
        <span key={t} className="flex items-center gap-1.5 whitespace-nowrap"><Shape kind={t} />{FLOW_NODE_LABEL[t]}</span>
      ))}
      <span className="w-px h-3.5 bg-[var(--line)]" />
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0"><path d="M0 4 H14" stroke="#a1a1aa" strokeWidth="1.2" /><path d="M13 1.5 L18 4 L13 6.5 Z" fill="#a1a1aa" /></svg>
        유저가 이동하는 흐름
      </span>
    </div>
  );
}
