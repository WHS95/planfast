"use client";
import { memo, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { FLOW_NODE_SIZE } from "@/lib/flow/layout";
import { frameTint } from "@/lib/flow/frames";
import type { FlowNodeType } from "@/lib/types";
import { useFlowUi } from "./FlowUiContext";

export type FlowNodeData = { label: string; description: string; kind: FlowNodeType };
export type FrameData = { label: string; description: string; color: string; index: number; implicit?: boolean };
export type RFNode = Node<FlowNodeData, FlowNodeType>;
export type RFFrame = Node<FrameData, "frame">;
export type RFAny = RFNode | RFFrame;
export const isFrameNode = (n: RFAny): n is RFFrame => n.type === "frame";

const handleCls = "!w-2 !h-2 !bg-white !border !border-zinc-400 dark:!bg-zinc-800 dark:!border-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity";

function Wrap({ children, selected, kind }: { children: React.ReactNode; selected?: boolean; kind: FlowNodeType }) {
  const size = FLOW_NODE_SIZE[kind];
  return (
    <div style={{ width: size.width, height: size.height }} className="relative group">
      {kind !== "start" && <Handle type="target" position={Position.Left} className={handleCls} />}
      {children}
      <Handle type="source" position={Position.Right} className={handleCls} />
      {selected && <div className="absolute -inset-1.5 rounded-[10px] ring-2 ring-accent/60 pointer-events-none" />}
    </div>
  );
}

/** 시작 — 검정 pill, 흰 글씨 */
export const StartNode = memo(function StartNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="start" selected={selected}>
      <div className="w-full h-full rounded-full bg-[var(--fg)] text-[var(--bg)] flex items-center justify-center text-[13px] font-medium px-4">
        <span className="truncate">{data.label || "시작"}</span>
      </div>
    </Wrap>
  );
});

/** 페이지 — 연보라 라운드 사각형 */
export const PageNode = memo(function PageNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="page" selected={selected}>
      <div className="w-full h-full rounded-lg border border-violet-300/80 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/15 flex flex-col justify-center px-3 py-2">
        <div className="text-[13px] font-medium text-violet-950 dark:text-violet-100 truncate">{data.label || "(제목 없음)"}</div>
        {data.description && <div className="text-[10.5px] text-violet-900/60 dark:text-violet-200/60 line-clamp-2 leading-snug mt-0.5">{data.description}</div>}
      </div>
    </Wrap>
  );
});

/** 데이터 — 하늘색 평행사변형 */
export const DataNode = memo(function DataNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="data" selected={selected}>
      <div className="w-full h-full -skew-x-[12deg] rounded-[6px] border border-sky-300/80 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/15" />
      <div className="absolute inset-0 flex flex-col justify-center px-5 pointer-events-none">
        <div className="text-[12.5px] font-medium text-sky-950 dark:text-sky-100 truncate">{data.label || "(제목 없음)"}</div>
        {data.description && <div className="text-[10.5px] text-sky-900/60 dark:text-sky-200/60 truncate">{data.description}</div>}
      </div>
    </Wrap>
  );
});

/** 분기 — 앰버 다이아몬드 */
export const BranchNode = memo(function BranchNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="branch" selected={selected}>
      <svg viewBox="0 0 176 84" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <polygon points="88,2 174,42 88,82 2,42" className="fill-amber-50 stroke-amber-400 dark:fill-amber-500/15 dark:stroke-amber-500/60" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-9 pointer-events-none">
        <div className="text-[11.5px] font-medium leading-tight text-center line-clamp-3 text-amber-950 dark:text-amber-100">{data.label || "(조건)"}</div>
      </div>
    </Wrap>
  );
});

/** 행동 — 흰 pill, 회색 테두리 */
export const ActionNode = memo(function ActionNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="action" selected={selected}>
      <div className="w-full h-full rounded-full border bg-panel flex items-center justify-center px-4">
        <span className="text-[12.5px] truncate">{data.label || "(제목 없음)"}</span>
      </div>
    </Wrap>
  );
});

/** 프레임(스윔레인) — 자식 노드를 담는 그룹 노드 */
export const FrameNode = memo(function FrameNode({ id, data, selected, width, height }: NodeProps<RFFrame>) {
  const ui = useFlowUi();
  const tint = frameTint(data.color, data.index);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  const commit = () => { setEditing(false); const t = text.trim(); if (t && t !== data.label) ui.renameFrame(id, t); else setText(data.label); };
  const implicit = !!data.implicit;

  return (
    <div className="group/frame w-full h-full relative" style={{ width, height }}>
      {!implicit && !ui.readOnly && (
        <NodeResizer minWidth={320} minHeight={120} lineClassName="!border-accent/40" handleClassName="!w-2 !h-2 !rounded-sm !border-accent !bg-panel" isVisible={selected} />
      )}
      <div
        className={clsx(
          "absolute inset-0 rounded-lg border transition-colors",
          implicit ? "border-dashed border-line" : selected ? "border-accent/50" : "border-line group-hover/frame:border-dashed group-hover/frame:border-accent/40",
        )}
        style={{ background: tint.bg }}
      />
      <div className="absolute left-3 top-2 flex items-center gap-1.5 max-w-[70%]">
        <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tint.dot }} />
        {editing ? (
          <input
            ref={inputRef}
            className="nodrag bg-panel border rounded px-1.5 py-0.5 text-[11.5px] font-medium outline-none focus:border-accent w-52"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(data.label); setEditing(false); } }}
          />
        ) : (
          <button
            className={clsx("text-[11.5px] font-medium truncate rounded px-1 py-0.5 -mx-1", implicit ? "text-muted cursor-default" : "hover:bg-black/[.04] dark:hover:bg-white/[.06]")}
            onClick={(e) => { e.stopPropagation(); if (!implicit && !ui.readOnly) ui.openFrame(id); }}
            onDoubleClick={(e) => { e.stopPropagation(); if (!implicit && !ui.readOnly) { setText(data.label); setEditing(true); } }}
            title={implicit ? "프레임에 속하지 않은 노드" : "클릭: 프레임 편집 · 더블클릭: 이름 변경"}
          >
            {data.label}
          </button>
        )}
        {data.description && !editing && <span className="text-[10.5px] text-muted truncate hidden group-hover/frame:inline">{data.description}</span>}
      </div>
    </div>
  );
});

export const flowNodeTypes = { start: StartNode, page: PageNode, data: DataNode, branch: BranchNode, action: ActionNode, frame: FrameNode };
