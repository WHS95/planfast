"use client";
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { AppWindow, Database, GitBranch, MousePointerClick, Play } from "lucide-react";
import { FLOW_NODE_SIZE } from "@/lib/flow/layout";
import type { FlowNodeType } from "@/lib/types";

export type FlowNodeData = { label: string; description: string; kind: FlowNodeType };
export type RFNode = Node<FlowNodeData, FlowNodeType>;

const handleCls = "!w-2.5 !h-2.5 !bg-zinc-400 !border-2 !border-panel";

function Wrap({ children, selected, className, style, kind }: { children: React.ReactNode; selected?: boolean; className?: string; style?: React.CSSProperties; kind: FlowNodeType }) {
  const size = FLOW_NODE_SIZE[kind];
  return (
    <div style={{ width: size.width, height: size.height, ...style }} className={clsx("relative", className)}>
      {kind !== "start" && <Handle type="target" position={Position.Left} className={handleCls} />}
      {children}
      <Handle type="source" position={Position.Right} className={handleCls} />
      {selected && <div className="absolute -inset-1 rounded-xl ring-2 ring-accent/50 pointer-events-none" />}
    </div>
  );
}

export const StartNode = memo(function StartNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="start" selected={selected}>
      <div className="w-full h-full rounded-full bg-emerald-600 text-white flex items-center justify-center gap-1.5 text-[13px] font-medium shadow-sm px-3">
        <Play size={12} fill="currentColor" /><span className="truncate">{data.label || "시작"}</span>
      </div>
    </Wrap>
  );
});

export const PageNode = memo(function PageNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="page" selected={selected}>
      <div className="w-full h-full rounded-lg border bg-panel shadow-sm flex flex-col overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b bg-bg text-[10px] text-muted">
          <span className="flex gap-0.5"><i className="w-1.5 h-1.5 rounded-full bg-rose-400" /><i className="w-1.5 h-1.5 rounded-full bg-amber-400" /><i className="w-1.5 h-1.5 rounded-full bg-emerald-400" /></span>
          <AppWindow size={10} /> 페이지
        </div>
        <div className="px-2.5 py-1.5 min-h-0">
          <div className="text-[13px] font-medium truncate">{data.label || "(제목 없음)"}</div>
          <div className="text-[10px] text-muted line-clamp-2 leading-snug">{data.description}</div>
        </div>
      </div>
    </Wrap>
  );
});

export const DataNode = memo(function DataNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="data" selected={selected}>
      <div className="w-full h-full relative">
        <div className="absolute inset-x-0 top-0 h-3.5 rounded-[50%] bg-sky-200 dark:bg-sky-800 border border-sky-400 dark:border-sky-600 z-10" />
        <div className="absolute inset-x-0 top-[7px] bottom-0 rounded-b-[50%/12px] bg-sky-50 dark:bg-sky-900/40 border border-t-0 border-sky-400 dark:border-sky-600 flex flex-col items-center justify-center px-3 pt-2 text-center">
          <div className="text-[10px] text-sky-700 dark:text-sky-300 flex items-center gap-1"><Database size={10} /> 데이터</div>
          <div className="text-[12px] font-medium truncate w-full">{data.label || "(제목 없음)"}</div>
        </div>
      </div>
    </Wrap>
  );
});

export const BranchNode = memo(function BranchNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="branch" selected={selected}>
      <div className="w-full h-full relative flex items-center justify-center">
        <svg viewBox="0 0 170 90" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <polygon points="85,2 168,45 85,88 2,45" className="fill-amber-50 stroke-amber-500 dark:fill-amber-900/40" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative text-center px-8">
          <div className="text-[10px] text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1"><GitBranch size={10} /> 분기</div>
          <div className="text-[12px] font-medium leading-tight line-clamp-2">{data.label || "(조건)"}</div>
        </div>
      </div>
    </Wrap>
  );
});

export const ActionNode = memo(function ActionNode({ data, selected }: NodeProps<RFNode>) {
  return (
    <Wrap kind="action" selected={selected}>
      <div className="w-full h-full rounded-2xl border border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30 shadow-sm flex flex-col justify-center px-3">
        <div className="text-[10px] text-violet-700 dark:text-violet-300 flex items-center gap-1"><MousePointerClick size={10} /> 행동</div>
        <div className="text-[12px] font-medium truncate">{data.label || "(제목 없음)"}</div>
        {data.description && <div className="text-[10px] text-muted truncate">{data.description}</div>}
      </div>
    </Wrap>
  );
});

export const flowNodeTypes = { start: StartNode, page: PageNode, data: DataNode, branch: BranchNode, action: ActionNode };
