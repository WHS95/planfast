"use client";
/** Small presentational controls shared by the tree / directory / document views and the drawer. */
import { useState } from "react";
import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from "@/lib/types";

export const STATUS_COLOR: Record<Status, string> = {
  writing: "#a1a1aa",
  proposed: "#0ea5e9",
  confirmed: "#6366f1",
  dev: "#f59e0b",
  done: "#10b981",
  hold: "#f43f5e",
};

/** "신규" pill for AI-proposed items */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span className={clsx("badge-new gap-0.5 shrink-0", className)} title="매니가 제안한 항목입니다">
      <Sparkles size={9} /> 신규
    </span>
  );
}

/** tree/list numbering, e.g. "1.2.3" */
export function NumTag({ n, className }: { n: string; className?: string }) {
  return <span className={clsx("font-mono text-[10px] text-muted tabular-nums shrink-0", className)}>{n}</span>;
}

/** dot + label, no interaction */
export function StatusChip({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={clsx("chip !py-0.5 !px-2 text-[11px] leading-none", className)} style={{ borderColor: `color-mix(in srgb, ${STATUS_COLOR[status]} 40%, var(--line))` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** chip-styled dropdown for 상태 */
export function StatusChipSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button className="cursor-pointer" onClick={() => setOpen((o) => !o)} title="상태 변경"><StatusChip status={value} className="hover:bg-black/[.03] dark:hover:bg-white/[.05]" /></button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 card shadow-lg py-1 w-36">
            {STATUSES.map((s) => (
              <button key={s} className={clsx("w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06]", s === value && "text-accent font-medium")}
                onClick={() => { onChange(s); setOpen(false); }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s] }} />{STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const BAR_LEVEL: Record<Priority, number> = { low: 1, medium: 2, high: 3 };
const BAR_COLOR: Record<Priority, string> = { low: "#a1a1aa", medium: "#f59e0b", high: "#f43f5e" };

/** 3-bar signal icon for 중요도 */
export function PriorityBars({ priority, className }: { priority: Priority; className?: string }) {
  const lv = BAR_LEVEL[priority];
  return (
    <span className={clsx("inline-flex items-end gap-[2px] h-3", className)} title={`중요도 ${PRIORITY_LABEL[priority]}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] rounded-[1px]" style={{ height: 4 + i * 4, background: i < lv ? BAR_COLOR[priority] : "var(--line)" }} />
      ))}
    </span>
  );
}

/** 중요도 popover select */
export function PriorityBarsSelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button className="btn btn-sm btn-ghost !px-1.5 !gap-1" onClick={() => setOpen((o) => !o)} title="중요도 변경">
        <PriorityBars priority={value} /> <span className="text-xs text-muted">{PRIORITY_LABEL[value]}</span>
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 card shadow-lg py-1 w-28">
            {PRIORITIES.map((p) => (
              <button key={p} className={clsx("w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-black/[.04] dark:hover:bg-white/[.06]", p === value && "text-accent font-medium")}
                onClick={() => { onChange(p); setOpen(false); }}>
                <PriorityBars priority={p} /> {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
