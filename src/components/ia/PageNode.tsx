"use client";
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { FileText, Link2 } from "lucide-react";
import type { Page } from "@/lib/types";

export type PageNodeData = { page: Page; detail: boolean; specNames: string[]; isRoot: boolean; dropTarget: boolean };
export type PageFlowNode = Node<PageNodeData, "page">;

export const IA_NODE_SIZE = { detail: { width: 220, height: 96 }, simple: { width: 170, height: 40 } };

export const PageNode = memo(function PageNode({ data, selected }: NodeProps<PageFlowNode>) {
  const { page, detail, specNames, isRoot, dropTarget } = data;
  const size = detail ? IA_NODE_SIZE.detail : IA_NODE_SIZE.simple;
  return (
    <div
      style={{ width: size.width, minHeight: size.height }}
      className={clsx(
        "rounded-lg border bg-panel shadow-sm transition-colors cursor-grab active:cursor-grabbing",
        selected ? "border-accent ring-2 ring-accent/30" : "hover:border-zinc-400",
        dropTarget && "border-accent border-dashed bg-accent-soft",
        isRoot && !selected && "border-zinc-400",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-400 !w-2 !h-2 !border-0" />
      <div className={clsx("flex items-center gap-1.5 px-3", detail ? "pt-2.5" : "py-2")}>
        <FileText size={13} className="text-muted shrink-0" />
        <div className="text-[13px] font-medium truncate">{page.name || "(이름 없음)"}</div>
      </div>
      {detail && (
        <div className="px-3 pb-2.5">
          <div className="text-[11px] text-muted leading-snug line-clamp-2 min-h-[28px]">{page.description || "설명 없음"}</div>
          {specNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {specNames.slice(0, 3).map((s, i) => (
                <span key={i} className="chip bg-accent-soft text-accent border-transparent !py-0 !text-[10px] max-w-[120px] truncate"><Link2 size={9} />{s}</span>
              ))}
              {specNames.length > 3 && <span className="chip !py-0 !text-[10px] text-muted">+{specNames.length - 3}</span>}
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400 !w-2 !h-2 !border-0" />
    </div>
  );
});
