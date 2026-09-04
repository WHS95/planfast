"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow,
  type Edge, type Node, type NodeMouseHandler, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Page } from "@/lib/types";
import { layoutTree } from "@/lib/flow/layout";
import { PageNode, IA_NODE_SIZE, type PageFlowNode } from "./PageNode";
import { descendantIds, type SpecRef, type ViewMode } from "./types";

const nodeTypes = { page: PageNode };

interface Props {
  pages: Page[];
  specs: SpecRef[];
  view: ViewMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReparent: (id: string, parentId: string | null) => void;
}

export function IaCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ pages, specs, view, selectedId, onSelect, onReparent }: Props) {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<PageFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const specName = useMemo(() => new Map(specs.map((s) => [s.id, s.title])), [specs]);

  // derive nodes/edges + dagre layout from pages
  useEffect(() => {
    const size = IA_NODE_SIZE[view];
    const pos = layoutTree(pages, size);
    setNodes(pages.map((p) => ({
      id: p.id, type: "page" as const, position: pos.get(p.id) ?? { x: 0, y: 0 }, width: size.width, height: size.height,
      selected: p.id === selectedId,
      data: { page: p, detail: view === "detail", specNames: p.linkedSpecIds.map((id) => specName.get(id)).filter((x): x is string => !!x), isRoot: !p.parentId, dropTarget: false },
    })));
    const ids = new Set(pages.map((p) => p.id));
    setEdges(pages.filter((p) => p.parentId && ids.has(p.parentId)).map((p) => ({ id: `e_${p.parentId}_${p.id}`, source: p.parentId!, target: p.id, type: "smoothstep", style: { stroke: "var(--line)", strokeWidth: 1.5 } })));
    const t = setTimeout(() => rf.fitView({ padding: 0.2, duration: 200, maxZoom: 1 }), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, view, specName]);

  // reflect external selection
  useEffect(() => { setNodes((ns) => ns.map((n) => n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })); }, [selectedId, setNodes]);
  // reflect drop-target highlight
  useEffect(() => { setNodes((ns) => ns.map((n) => n.data.dropTarget === (n.id === dropTarget) ? n : { ...n, data: { ...n.data, dropTarget: n.id === dropTarget } })); }, [dropTarget, setNodes]);

  const findTarget = useCallback((node: Node) => {
    const hits = rf.getIntersectingNodes(node).filter((n) => n.id !== node.id);
    if (!hits.length) return null;
    const desc = descendantIds(pages, node.id);
    const ok = hits.filter((h) => !desc.has(h.id));
    return ok[0]?.id ?? null;
  }, [rf, pages]);

  const onDragStart: OnNodeDrag = useCallback((_e, node) => { dragStart.current = { ...node.position }; }, []);
  const onDrag: OnNodeDrag = useCallback((_e, node) => { setDropTarget(findTarget(node)); }, [findTarget]);
  const onDragStop: OnNodeDrag = useCallback((_e, node) => {
    const target = findTarget(node);
    setDropTarget(null);
    const page = pages.find((p) => p.id === node.id);
    const s = dragStart.current; dragStart.current = null;
    const dist = s ? Math.hypot(node.position.x - s.x, node.position.y - s.y) : 0;
    const snapBack = () => { if (s) setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, position: s } : n)); };
    if (!page) return;
    if (target) { if (target !== page.parentId) onReparent(page.id, target); else snapBack(); return; }
    if (dist > 60 && page.parentId) { onReparent(page.id, null); return; }
    snapBack();
  }, [findTarget, pages, onReparent, setNodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => onSelect(node.id), [onSelect]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => onSelect(null)}
      onNodeDragStart={onDragStart}
      onNodeDrag={onDrag}
      onNodeDragStop={onDragStop}
      nodesConnectable={false}
      elevateNodesOnSelect
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background gap={20} size={1} color="var(--line)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-panel" nodeColor={() => "var(--accent-soft)"} />
    </ReactFlow>
  );
}
