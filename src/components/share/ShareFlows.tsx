"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ReactFlow, Background, BackgroundVariant, Controls, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Flow } from "@/lib/types";
import { Empty } from "@/components/ui";
import { flowNodeTypes, type RFAny } from "@/components/flow/FlowNodes";
import { flowEdgeTypes, type RFEdge } from "@/components/flow/FlowEdges";
import { FlowLegend } from "@/components/flow/FlowLegend";
import { buildGraph } from "@/components/flow/rfGraph";

const nodeTypes = flowNodeTypes as unknown as NodeTypes;

/** 공유 뷰: 편집 없이 프레임(스윔레인)까지 그대로 렌더한다. (FlowUiContext 기본값이 readOnly) */
export function ShareFlows({ flows }: { flows: Flow[] }) {
  const [cur, setCur] = useState(flows[0]?.id ?? null);
  const flow = flows.find((f) => f.id === cur);
  const graph = useMemo<{ nodes: RFAny[]; edges: RFEdge[] }>(() => (flow ? buildGraph(flow, { readOnly: true }) : { nodes: [], edges: [] }), [flow]);
  if (flows.length === 0) return <div className="p-8"><Empty>유저플로우가 아직 없어요</Empty></div>;
  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-56 border-r bg-panel overflow-y-auto p-2 space-y-0.5 shrink-0">
        {flows.map((f) => <button key={f.id} onClick={() => setCur(f.id)} className={clsx("w-full text-left text-sm rounded-md px-2.5 py-1.5 truncate", cur === f.id ? "bg-accent-soft text-accent font-medium" : "hover:bg-black/[.03] dark:hover:bg-white/[.05]")}>{f.name}</button>)}
      </aside>
      <div className="flex-1 min-w-0 relative">
        {flow?.request && <div className="absolute z-10 top-3 left-3 max-w-md text-xs text-muted bg-panel/90 border rounded-md px-3 py-2">{flow.request}</div>}
        <FlowLegend className="absolute top-3 right-3 z-10" />
        <ReactFlow
          key={flow?.id}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={flowEdgeTypes}
          className="canvas-dots"
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.15}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--dot)" style={{ backgroundColor: "var(--canvas)" }} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
