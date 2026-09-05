/**
 * 도메인 Flow ↔ React Flow 그래프 변환.
 *
 * - 프레임(스윔레인)은 React Flow 의 **부모(group) 노드**로 렌더한다. 자식 노드는 `parentId` 를 갖고
 *   좌표가 부모 기준 상대 좌표가 된다 → 프레임을 끌면 자식이 함께 움직인다.
 * - 반면 DB 에 저장되는 `FlowNode.position` 은 항상 **절대 좌표**다(공유 뷰·내보내기 호환).
 *   그래서 변환 시 abs↔rel 을 여기서만 처리한다.
 * - 프레임에 속하지 않은 노드를 감싸는 "기타" 레인은 배경 장식일 뿐이라 parentId 를 붙이지 않고
 *   저장에도 포함하지 않는다.
 */
import { MarkerType } from "@xyflow/react";
import type { Flow, FlowEdge, FlowFrame, FlowNode } from "@/lib/types";
import { FLOW_NODE_SIZE } from "@/lib/flow/layout";
import {
  FRAME_MIN_H, FRAME_MIN_W, implicitFrame, layoutFramedFlow, needsLayout, toBoxes, type FrameBox,
} from "@/lib/flow/frames";
import { EDGE_BASE, type RFEdge } from "./FlowEdges";
import { isFrameNode, type RFAny, type RFFrame, type RFNode } from "./FlowNodes";

export interface GraphInput { nodes: FlowNode[]; edges: FlowEdge[]; frames: FlowFrame[] }
export interface BuildOptions { readOnly?: boolean }

const round = (v: number) => Math.round(v);

export function frameToRF(f: FrameBox, index: number, opts: { implicit?: boolean; readOnly?: boolean } = {}): RFFrame {
  const implicit = !!opts.implicit;
  const interactive = !implicit && !opts.readOnly;
  return {
    id: f.id,
    type: "frame",
    position: { x: f.x, y: f.y },
    width: f.w,
    height: f.h,
    data: { label: f.label, description: f.description ?? "", color: f.color ?? "neutral", index, implicit },
    draggable: interactive,
    selectable: interactive,
    connectable: false,
    // 레인은 항상 엣지/노드 뒤에 깔린다. (자식은 React Flow 가 부모보다 위로 올려준다)
    zIndex: -1,
    deletable: false,
  };
}

export function nodeToRF(n: FlowNode, parent: FrameBox | undefined, opts: BuildOptions = {}): RFNode {
  const size = FLOW_NODE_SIZE[n.type];
  const position = parent ? { x: round(n.position.x - parent.x), y: round(n.position.y - parent.y) } : { x: round(n.position.x), y: round(n.position.y) };
  return {
    id: n.id,
    type: n.type,
    position,
    data: { label: n.label, description: n.description, kind: n.type },
    ...size,
    ...(parent ? { parentId: parent.id } : {}),
    draggable: !opts.readOnly,
    selectable: !opts.readOnly,
    connectable: !opts.readOnly,
  };
}

export function edgeToRF(e: FlowEdge): RFEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: "flow",
    ...(e.label ? { label: e.label } : {}),
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_BASE },
    style: { stroke: EDGE_BASE, strokeWidth: 1.4 },
    data: {},
  };
}

/** frameId 를 떼어낸 사본 (프레임 삭제·소속 해제용) */
export const withoutFrame = (n: FlowNode): FlowNode => { const c = { ...n }; delete c.frameId; return c; };

export const edgeFromRF = (e: RFEdge): FlowEdge => ({
  id: e.id, source: e.source, target: e.target,
  ...(typeof e.label === "string" && e.label.trim() ? { label: e.label.trim() } : {}),
});

/** RF 노드 배열(프레임 포함) → 저장용 노드/프레임. 좌표는 절대 좌표로 되돌린다. */
export function toDomain(rf: RFAny[]): { nodes: FlowNode[]; frames: FrameBox[] } {
  const frameNodes = rf.filter(isFrameNode).filter((f) => !f.data.implicit);
  const boxes: FrameBox[] = [...frameNodes]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((f, i) => ({
      id: f.id,
      label: f.data.label,
      description: f.data.description,
      color: f.data.color,
      order: i,
      x: round(f.position.x),
      y: round(f.position.y),
      w: round(f.width ?? f.measured?.width ?? FRAME_MIN_W),
      h: round(f.height ?? f.measured?.height ?? FRAME_MIN_H),
    }));
  const pos = new Map(boxes.map((b) => [b.id, b]));
  const nodes: FlowNode[] = [];
  for (const n of rf) {
    if (isFrameNode(n)) continue;
    const parent = n.parentId ? pos.get(n.parentId) : undefined;
    nodes.push({
      id: n.id,
      type: n.data.kind,
      label: n.data.label,
      description: n.data.description,
      position: { x: round(n.position.x + (parent?.x ?? 0)), y: round(n.position.y + (parent?.y ?? 0)) },
      ...(parent ? { frameId: parent.id } : {}),
    });
  }
  return { nodes, frames: boxes };
}

/**
 * 저장된 그래프 → React Flow 노드 배열.
 * 프레임 기하가 비어 있으면(예: AI 가 막 만든 플로우) 여기서 한 번 자동 배치하고 `relaidOut` 으로 알린다.
 */
export function buildNodes(input: GraphInput, opts: BuildOptions = {}): { nodes: RFAny[]; relaidOut: boolean } {
  // 기하(x/y/w/h)가 없는 프레임이 하나라도 있으면 최초 1회 자동 배치한다.
  const relaidOut = input.frames.length > 0 && needsLayout(input.frames);
  let frames = toBoxes(input.frames);
  let nodes = input.nodes;
  if (relaidOut) {
    const r = layoutFramedFlow(nodes, input.edges, input.frames);
    frames = r.frames;
    nodes = nodes.map((n) => ({ ...n, position: r.positions.get(n.id) ?? n.position }));
  }
  const known = new Map(frames.map((f) => [f.id, f]));
  const other = implicitFrame(nodes, frames);
  const out: RFAny[] = frames.map((f, i) => frameToRF(f, i, { readOnly: opts.readOnly }));
  if (other) out.push(frameToRF(other, frames.length, { implicit: true, readOnly: opts.readOnly }));
  for (const n of nodes) out.push(nodeToRF(n, n.frameId ? known.get(n.frameId) : undefined, opts));
  return { nodes: out, relaidOut };
}

/** Flow 전체(노드+엣지) → React Flow 초기 상태 */
export function buildGraph(flow: Flow, opts: BuildOptions = {}) {
  const { nodes, relaidOut } = buildNodes({ nodes: flow.nodes, edges: flow.edges, frames: flow.frames }, opts);
  return { nodes, edges: flow.edges.map(edgeToRF), relaidOut };
}
