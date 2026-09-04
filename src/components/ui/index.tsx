"use client";
import clsx from "clsx";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  const color: Record<Status, string> = {
    writing: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    proposed: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    confirmed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    dev: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    hold: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };
  return <span className={clsx("chip border-transparent", color[status])}>{STATUS_LABEL[status]}</span>;
}
export function PriorityDot({ priority }: { priority: Priority }) {
  const c = { low: "bg-zinc-400", medium: "bg-amber-400", high: "bg-rose-500" }[priority];
  return <span title={PRIORITY_LABEL[priority]} className={clsx("inline-block w-2 h-2 rounded-full", c)} />;
}
export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <select className="input !w-auto !py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value as Status)}>
      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}
export function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <select className="input !w-auto !py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value as Priority)}>
      {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
    </select>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin", className)} />;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-muted text-sm py-10 text-center border rounded-lg border-dashed">{children}</div>;
}
