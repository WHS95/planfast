"use client";
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import clsx from "clsx";
import { Pencil } from "lucide-react";
import { useFlowUi } from "./FlowUiContext";

export type FlowEdgeData = { hovered?: boolean; highlighted?: boolean };
export type RFEdge = Edge<FlowEdgeData, "flow">;

/** 선택된 경로 강조색 (레퍼런스의 붉은 하이라이트) / 기본 연결선 색 */
export const EDGE_HL = "#e11d48";
export const EDGE_BASE = "#a1a1aa";

export const FlowStepEdge = memo(function FlowStepEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, style, data,
}: EdgeProps<RFEdge>) {
  const ui = useFlowUi();
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  const hot = !!data?.highlighted;
  const show = !!label || (!!data?.hovered && !ui.readOnly);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={20} />
      {show && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }} className={clsx("absolute nodrag nopan", !ui.readOnly && "pointer-events-auto")}>
            <button
              className={clsx("chip bg-panel/95 shadow-sm text-[10.5px] leading-none py-1", !hot && "text-muted", !ui.readOnly && "cursor-pointer hover:border-accent hover:text-accent")}
              style={hot ? { borderColor: EDGE_HL, color: EDGE_HL } : undefined}
              onClick={(e) => { if (ui.readOnly) return; e.stopPropagation(); ui.editEdge(id); }}
              disabled={ui.readOnly}
            >
              {label ? <span className="truncate max-w-[150px]">{String(label)}</span> : <><Pencil size={9} /> 라벨</>}
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const flowEdgeTypes = { flow: FlowStepEdge };
