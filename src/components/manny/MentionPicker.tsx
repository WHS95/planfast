"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FileText, ListTree, GitBranch, LayoutTemplate } from "lucide-react";

export interface MentionIndex {
  prd: { key: string; title: string }[];
  items: { id: string; type: string; title: string }[];
  flows: { id: string; name: string }[];
  wireframes: { id: string; name: string }[];
}
export interface MentionChip { type: "prd" | "item" | "flow" | "wireframe"; id: string; label: string }

const TYPE_LABEL: Record<string, string> = { requirement: "요구사항", feature: "기능", spec: "상세기능" };
const TYPE_COLOR: Record<string, string> = {
  requirement: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  feature: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  spec: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type Entry = MentionChip & { sub?: string; kindLabel: string; icon: React.ReactNode };

export function MentionPicker({ index, query, onPick, onClose }: { index: MentionIndex | null; query: string; onPick: (m: MentionChip) => void; onClose: () => void }) {
  const entries = useMemo<Entry[]>(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    const all: Entry[] = [
      ...index.prd.map((s) => ({ type: "prd" as const, id: s.key, label: `PRD · ${s.title}`, kindLabel: "PRD", icon: <FileText size={12} /> })),
      ...index.items.map((i) => ({ type: "item" as const, id: i.id, label: i.title, sub: i.type, kindLabel: TYPE_LABEL[i.type] ?? i.type, icon: <ListTree size={12} /> })),
      ...index.flows.map((f) => ({ type: "flow" as const, id: f.id, label: f.name, kindLabel: "플로우", icon: <GitBranch size={12} /> })),
      ...index.wireframes.map((w) => ({ type: "wireframe" as const, id: w.id, label: w.name, kindLabel: "와이어프레임", icon: <LayoutTemplate size={12} /> })),
    ];
    return (q ? all.filter((e) => e.label.toLowerCase().includes(q) || e.kindLabel.toLowerCase().includes(q)) : all).slice(0, 40);
  }, [index, query]);
  const [cursor, setCursor] = useState(0);
  // reset cursor to 0 whenever the query changes (render-time adjustment, not an effect)
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) { setPrevQuery(query); setCursor(0); }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, entries.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { if (entries[cursor]) { e.preventDefault(); onPick(entries[cursor]); } }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [entries, cursor, onPick, onClose]);

  return (
    <div className="absolute left-0 right-0 bottom-full mb-1 card shadow-lg max-h-64 overflow-y-auto z-20 py-1">
      {!index && <div className="px-3 py-2 text-xs text-muted">불러오는 중…</div>}
      {index && entries.length === 0 && <div className="px-3 py-2 text-xs text-muted">일치하는 대상이 없습니다</div>}
      {entries.map((e, i) => (
        <button key={`${e.type}:${e.id}`} onMouseDown={(ev) => { ev.preventDefault(); onPick(e); }} onMouseEnter={() => setCursor(i)}
          className={clsx("w-full text-left px-3 py-1.5 text-xs flex items-center gap-2", i === cursor ? "bg-accent-soft text-accent" : "hover:bg-black/[.03]")}>
          <span className="text-muted">{e.icon}</span>
          <span className={clsx("chip border-transparent !py-0", e.sub ? TYPE_COLOR[e.sub] : "bg-black/[.05] text-muted")}>{e.kindLabel}</span>
          <span className="truncate">{e.label}</span>
        </button>
      ))}
    </div>
  );
}
