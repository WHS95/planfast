/**
 * dagre auto-layout helper. Shared by the IA tree (top-down) and user-flow canvas (left-to-right).
 * Pure function: takes nodes/edges + sizes, returns top-left positions keyed by node id.
 * Works on both server (AI routes) and client (자동 정렬 button).
 */
import dagre from "@dagrejs/dagre";
import type { FlowNodeType } from "@/lib/types";

export interface LayoutNode { id: string; width?: number; height?: number }
export interface LayoutEdge { source: string; target: string }
export interface LayoutOptions {
  direction?: "TB" | "LR";
  nodeWidth?: number;
  nodeHeight?: number;
  /** gap between nodes in the same rank */
  nodesep?: number;
  /** gap between ranks */
  ranksep?: number;
}

export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions = {}): Map<string, { x: number; y: number }> {
  const { direction = "TB", nodeWidth = 200, nodeHeight = 64, nodesep = 40, ranksep = 70 } = opts;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep, ranksep, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: n.width ?? nodeWidth, height: n.height ?? nodeHeight });
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    const w = n.width ?? nodeWidth; const h = n.height ?? nodeHeight;
    // dagre gives centers; React Flow wants top-left
    out.set(n.id, { x: Math.round((p?.x ?? 0) - w / 2), y: Math.round((p?.y ?? 0) - h / 2) });
  }
  return out;
}

/** Default rendered sizes of the 5 user-flow node kinds (must match FlowNodes.tsx styles). */
export const FLOW_NODE_SIZE: Record<FlowNodeType, { width: number; height: number }> = {
  start: { width: 120, height: 44 },
  page: { width: 200, height: 76 },
  data: { width: 180, height: 70 },
  branch: { width: 170, height: 90 },
  action: { width: 180, height: 64 },
};

/** Layout a user flow (left→right). Returns positions per node id. */
export function layoutFlow<N extends { id: string; type: FlowNodeType }>(nodes: N[], edges: LayoutEdge[]) {
  return layoutGraph(
    nodes.map((n) => ({ id: n.id, ...FLOW_NODE_SIZE[n.type] })),
    edges,
    { direction: "LR", nodesep: 36, ranksep: 90 },
  );
}

/** Layout an IA tree (top→down) from parentId relationships. */
export function layoutTree<N extends { id: string; parentId: string | null }>(nodes: N[], size: { width: number; height: number }) {
  const ids = new Set(nodes.map((n) => n.id));
  const edges = nodes.filter((n) => n.parentId && ids.has(n.parentId)).map((n) => ({ source: n.parentId!, target: n.id }));
  return layoutGraph(nodes.map((n) => ({ id: n.id, ...size })), edges, { direction: "TB", nodesep: 28, ranksep: 60 });
}
