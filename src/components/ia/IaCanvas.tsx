"use client";
/**
 * 정보구조도 캔버스 (FigJam 류 자유 배치).
 *
 * - 노드를 아무데나 끌어다 놓을 수 있고, 놓은 좌표는 `page.meta.x/y` 로 저장된다.
 * - 좌표가 없는 페이지만 dagre 자동 배치로 자리를 잡는다(신규 생성/AI 제안 직후).
 * - 계층(상위-하위) 변경은 "본체 드래그"가 아니라 **연결선**으로 한다.
 *   본체 드래그는 순수 이동이라 위치만 바뀌고, 아래 핸들 → 다른 노드 위 핸들로 선을 이으면 상위-하위가 된다.
 *   선을 지우면 최상위로 빠진다. (예전엔 빈 곳에 놓기만 해도 최상위로 튀어나가 사고가 잦았다)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type NodeMouseHandler, type OnNodeDrag,
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
  /** 드래그로 옮긴 노드 좌표 저장(여러 개 동시 이동 가능) */
  onMove: (positions: { id: string; x: number; y: number }[]) => void;
}

export function IaCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ pages, specs, view, selectedId, onSelect, onReparent, onMove }: Props) {
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<PageFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [connectHint, setConnectHint] = useState(false);
  const specName = useMemo(() => new Map(specs.map((s) => [s.id, s.title])), [specs]);
  // 구조(페이지 구성/계층/보기모드)가 바뀔 때만 화면을 다시 맞춘다.
  // 설명 한 글자 고치거나 노드를 옮겼다고 줌/위치가 초기화되면 못 쓴다.
  const lastFitKey = useRef<string | null>(null);

  useEffect(() => {
    const size = IA_NODE_SIZE[view];
    // 저장된 좌표가 없는 페이지만 자동 배치로 자리를 잡아준다.
    const auto = layoutTree(pages, size);
    setNodes(pages.map((p) => ({
      id: p.id, type: "page" as const,
      position: { x: p.meta.x ?? auto.get(p.id)?.x ?? 0, y: p.meta.y ?? auto.get(p.id)?.y ?? 0 },
      width: size.width, height: size.height,
      selected: p.id === selectedId,
      data: { page: p, detail: view === "detail", specNames: p.linkedSpecIds.map((id) => specName.get(id)).filter((x): x is string => !!x), isRoot: !p.parentId, dropTarget: false },
    })));
    const ids = new Set(pages.map((p) => p.id));
    setEdges(pages.filter((p) => p.parentId && ids.has(p.parentId)).map((p) => ({
      id: `e_${p.parentId}_${p.id}`, source: p.parentId!, target: p.id, type: "smoothstep",
      style: { stroke: "var(--line-strong)", strokeWidth: 1.5 },
    })));
    const fitKey = view + "|" + pages.map((p) => `${p.id}:${p.parentId ?? ""}`).sort().join(",");
    if (lastFitKey.current !== fitKey) {
      lastFitKey.current = fitKey;
      const t = setTimeout(() => rf.fitView({ padding: 0.2, duration: 200, maxZoom: 1 }), 30);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, view, specName]);

  // reflect external selection
  useEffect(() => { setNodes((ns) => ns.map((n) => n.selected === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })); }, [selectedId, setNodes]);

  /** 본체 드래그는 순수 이동 — 끝난 시점에 (같이 끌린 노드까지) 좌표를 저장한다. */
  const onDragStop: OnNodeDrag = useCallback((_e, node, dragged) => {
    const moved = (dragged?.length ? dragged : [node]).map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }));
    if (moved.length) onMove(moved);
  }, [onMove]);

  /** 선을 이으면 source 가 상위, target 이 하위가 된다. 자기 자손을 상위로 삼는 순환은 막는다. */
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    if (descendantIds(pages, c.target).has(c.source)) return;
    onReparent(c.target, c.source);
  }, [pages, onReparent]);

  /** 선을 지우면 그 하위 페이지는 최상위로 올라온다. */
  const onEdgesDelete = useCallback((removed: Edge[]) => {
    for (const e of removed) onReparent(e.target, null);
  }, [onReparent]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => onSelect(node.id), [onSelect]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={onDragStop}
      onConnect={onConnect}
      onConnectStart={() => setConnectHint(true)}
      onConnectEnd={() => setConnectHint(false)}
      onEdgesDelete={onEdgesDelete}
      nodesConnectable
      elevateNodesOnSelect
      selectionOnDrag
      panOnDrag={[1, 2]}
      snapToGrid
      snapGrid={[8, 8]}
      minZoom={0.2}
      maxZoom={1.5}
      deleteKeyCode={["Backspace", "Delete"]}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="var(--line-strong)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-panel" nodeColor={() => "var(--accent-soft)"} />
      {connectHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 chip bg-accent text-white border-transparent shadow-lg">
          연결할 페이지 위에 놓으면 하위 페이지가 됩니다
        </div>
      )}
    </ReactFlow>
  );
}
