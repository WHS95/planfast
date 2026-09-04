"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ReactFlow, Background, Controls, Handle, Position, type Node, type Edge, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FLOW_NODE_LABEL, type Flow, type FlowNode, type FlowNodeType } from "@/lib/types";
import { Empty } from "@/components/ui";

const COLOR: Record<FlowNodeType, string> = {
  start: "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200",
  page: "bg-panel border-line",
  data: "bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-900/30 dark:border-sky-700 dark:text-sky-200",
  branch: "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200",
  action: "bg-indigo-50 border-indigo-300 text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-200",
};
type RO = Node<{ label: string; description: string; kind: FlowNodeType }>;
function ReadOnlyNode({ data }: NodeProps<RO>) {
  return (
    <div className={clsx("rounded-lg border px-3 py-2 min-w-[140px] max-w-[220px] text-xs shadow-sm", COLOR[data.kind], data.kind === "branch" && "rounded-2xl")}>
      <Handle type="target" position={Position.Top} className="!bg-muted !w-1.5 !h-1.5" />
      <div className="text-[10px] opacity-70">{FLOW_NODE_LABEL[data.kind]}</div>
      <div className="font-medium">{data.label}</div>
      {data.description && <div className="opacity-70 mt-0.5 line-clamp-3">{data.description}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-1.5 !h-1.5" />
    </div>
  );
}
const nodeTypes = { ro: ReadOnlyNode };

export function ShareFlows({ flows }: { flows: Flow[] }) {
  const [cur, setCur] = useState(flows[0]?.id ?? null);
  const flow = flows.find((f) => f.id === cur);
  const { nodes, edges } = useMemo(() => {
    if (!flow) return { nodes: [] as RO[], edges: [] as Edge[] };
    const nodes: RO[] = flow.nodes.map((n: FlowNode) => ({ id: n.id, type: "ro", position: n.position, data: { label: n.label, description: n.description, kind: n.type }, draggable: false, selectable: false, connectable: false }));
    const edges: Edge[] = flow.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, animated: false, style: { stroke: "var(--muted)" }, labelStyle: { fontSize: 11 } }));
    return { nodes, edges };
  }, [flow]);
  if (flows.length === 0) return <div className="p-8"><Empty>유저플로우가 아직 없어요</Empty></div>;
  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-56 border-r bg-panel overflow-y-auto p-2 space-y-0.5 shrink-0">
        {flows.map((f) => <button key={f.id} onClick={() => setCur(f.id)} className={clsx("w-full text-left text-sm rounded-md px-2.5 py-1.5 truncate", cur === f.id ? "bg-accent-soft text-accent font-medium" : "hover:bg-black/[.03] dark:hover:bg-white/[.05]")}>{f.name}</button>)}
      </aside>
      <div className="flex-1 min-w-0 relative">
        {flow?.request && <div className="absolute z-10 top-3 left-3 max-w-md text-xs text-muted bg-panel/90 border rounded-md px-3 py-2">{flow.request}</div>}
        <ReactFlow key={flow?.id} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false} panOnDrag zoomOnScroll proOptions={{ hideAttribution: true }}>
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
