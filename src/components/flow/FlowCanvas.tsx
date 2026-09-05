"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type EdgeMouseHandler, type NodeMouseHandler, type NodeTypes, type OnNodeDrag, type OnNodesChange, type OnNodesDelete, type OnEdgesDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, LayoutGrid, Plus, SquareDashed } from "lucide-react";
import { api } from "@/lib/api";
import { rid, FLOW_NODE_LABEL, FLOW_NODE_TYPES, type Flow, type FlowNode, type FlowNodeType } from "@/lib/types";
import { FLOW_NODE_SIZE } from "@/lib/flow/layout";
import {
  FRAME_COLOR_CYCLE, clampToFrame, frameAtPoint, layoutFramedFlow, nextFrameBox, type FrameBox,
} from "@/lib/flow/frames";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { flowNodeTypes, isFrameNode, type RFAny } from "./FlowNodes";
import { flowEdgeTypes, EDGE_BASE, EDGE_HL, type RFEdge } from "./FlowEdges";
import { FlowLegend } from "./FlowLegend";
import { FlowUiContext, type FlowUi } from "./FlowUiContext";
import { NodeDrawer, EdgeDrawer, FrameDrawer } from "./FlowDrawer";
import { buildGraph, buildNodes, edgeFromRF, edgeToRF, toDomain, withoutFrame } from "./rfGraph";

interface Props { projectId: string; flow: Flow; onSaved: (f: Flow) => void }

export function FlowCanvas(props: Props) {
  return <ReactFlowProvider><Inner key={props.flow.id} {...props} /></ReactFlowProvider>;
}

const nodeTypes = flowNodeTypes as unknown as NodeTypes;

function Inner({ projectId, flow, onSaved }: Props) {
  const rf = useReactFlow();
  const { setSelection, mention } = useEditor();
  const [initial] = useState(() => buildGraph(flow));
  const [nodes, setNodes, onNodesChange] = useNodesState<RFAny>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(initial.edges);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [selFrame, setSelFrame] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [saved, setSaved] = useState(!initial.relaidOut);
  /** touch() 가 노드/엣지를 안 바꾸는 경우에도 저장 effect 를 반드시 한 번 더 돌리기 위한 카운터 */
  const [dirtyTick, setDirtyTick] = useState(0);
  const dirty = useRef(initial.relaidOut);
  const lastSaved = useRef(flow.updatedAt);

  // 외부 변경(다른 탭 / 매니) → 편집 중이 아니면 다시 시드
  useEffect(() => {
    if (flow.updatedAt === lastSaved.current || dirty.current) return;
    lastSaved.current = flow.updatedAt;
    const g = buildGraph(flow);
    setNodes(g.nodes); setEdges(g.edges);
  }, [flow, setNodes, setEdges]);

  // 디바운스 자동 저장: touch() 는 dirty 플래그만 세우고, 아래 effect 가 마지막 변경 700ms 뒤 저장
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      const { nodes: dn, frames } = toDomain(nodes);
      api<Flow>(`/api/projects/${projectId}/flows/${flow.id}`, { method: "PATCH", json: { nodes: dn, edges: edges.map(edgeFromRF), frames } })
        .then((f) => { lastSaved.current = f.updatedAt; dirty.current = false; setSaved(true); onSaved(f); broadcastChange(projectId); })
        .catch((e) => alert((e as Error).message));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, dirtyTick, projectId, flow.id]);
  const touch = useCallback(() => { dirty.current = true; setSaved(false); setDirtyTick((t) => t + 1); }, []);

  const handleNodesChange: OnNodesChange<RFAny> = useCallback((changes) => {
    onNodesChange(changes);
    if (changes.some((c) => c.type === "dimensions" && c.resizing)) touch();
  }, [onNodesChange, touch]);

  const onNodeDragStop: OnNodeDrag<RFAny> = useCallback((_e, node) => {
    touch();
    if (isFrameNode(node)) return;
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const cur = dn.find((n) => n.id === node.id);
      if (!cur) return ns;
      const size = FLOW_NODE_SIZE[cur.type];
      const hit = frameAtPoint(frames, { x: cur.position.x + size.width / 2, y: cur.position.y + size.height / 2 });
      const pos = hit ? clampToFrame(hit, cur.position, size) : cur.position;
      // 소속도 위치도 그대로면 아무것도 하지 않는다 (드래그 중 나온 position change 는 이미 반영됨)
      if ((hit?.id ?? undefined) === cur.frameId && pos.x === cur.position.x && pos.y === cur.position.y) return ns;
      const next = dn.map((n) => (n.id !== cur.id ? n : hit ? { ...n, frameId: hit.id, position: pos } : withoutFrame(n)));
      // 프레임 소속이 바뀌면 "기타" 레인 유무까지 달라지므로 전체를 다시 만든다
      const rebuilt = buildNodes({ nodes: next, edges: [], frames }).nodes;
      const sel = new Set(ns.filter((n) => n.selected).map((n) => n.id));
      return sel.size ? rebuilt.map((n) => (sel.has(n.id) ? { ...n, selected: true } : n)) : rebuilt;
    });
  }, [setNodes, touch]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setEdges((es) => addEdge(edgeToRF({ id: `e_${rid()}`, source: c.source, target: c.target }), es)); touch();
  }, [setEdges, touch]);
  const onNodesDelete: OnNodesDelete<RFAny> = useCallback((deleted) => { if (deleted.some((d) => d.id === selNode)) setSelNode(null); touch(); }, [selNode, touch]);
  const onEdgesDelete: OnEdgesDelete = useCallback((deleted) => { if (deleted.some((d) => d.id === selEdge)) setSelEdge(null); touch(); }, [selEdge, touch]);

  const onNodeClick: NodeMouseHandler<RFAny> = useCallback((_e, n) => {
    if (isFrameNode(n)) { setSelNode(null); setSelEdge(null); return; }
    setSelNode(n.id); setSelEdge(null); setSelFrame(null);
    setSelection({ type: "flow", id: flow.id, label: `${flow.name} · ${n.data.label}` });
  }, [flow.id, flow.name, setSelection]);
  const onEdgeClick: EdgeMouseHandler<RFEdge> = useCallback((_e, e) => { setSelEdge(e.id); setSelNode(null); setSelFrame(null); }, []);
  const onPaneClick = useCallback(() => { setSelNode(null); setSelEdge(null); setSelFrame(null); setSelection(null); }, [setSelection]);

  // ── 노드 편집 ─────────────────────────────────────────────────────────────
  const patchNode = useCallback((id: string, patch: Partial<Pick<FlowNode, "label" | "description" | "type">>) => {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id || isFrameNode(n)) return n;
      const kind = patch.type ?? n.data.kind;
      return { ...n, type: kind, ...FLOW_NODE_SIZE[kind], data: { ...n.data, kind, label: patch.label ?? n.data.label, description: patch.description ?? n.data.description } };
    }));
    touch();
  }, [setNodes, touch]);

  const setNodeFrame = useCallback((id: string, frameId: string | null) => {
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const target = frameId ? frames.find((f) => f.id === frameId) : undefined;
      const next = dn.map((n) => {
        if (n.id !== id) return n;
        if (!target) return withoutFrame(n);
        return { ...n, frameId: target.id, position: clampToFrame(target, n.position, FLOW_NODE_SIZE[n.type]) };
      });
      return buildNodes({ nodes: next, edges: [], frames }).nodes;
    });
    touch();
  }, [setNodes, touch]);

  const deleteNode = useCallback((id: string) => { rf.deleteElements({ nodes: [{ id }] }); setSelNode(null); }, [rf]);
  const patchEdge = useCallback((id: string, label: string) => { setEdges((es) => es.map((e) => (e.id === id ? { ...e, label } : e))); touch(); }, [setEdges, touch]);
  const deleteEdge = useCallback((id: string) => { rf.deleteElements({ edges: [{ id }] }); setSelEdge(null); }, [rf]);

  // ── 프레임 편집 ───────────────────────────────────────────────────────────
  const patchFrame = useCallback((id: string, patch: Partial<{ label: string; description: string; color: string }>) => {
    setNodes((ns) => ns.map((n) => (n.id === id && isFrameNode(n) ? { ...n, data: { ...n.data, ...patch } } : n)));
    touch();
  }, [setNodes, touch]);

  const deleteFrame = useCallback((id: string) => {
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const next = dn.map((n) => (n.frameId === id ? withoutFrame(n) : n));
      return buildNodes({ nodes: next, edges: [], frames: frames.filter((f) => f.id !== id) }).nodes;
    });
    setSelFrame(null); touch();
  }, [setNodes, touch]);

  const addFrame = useCallback(() => {
    const id = `f_${rid()}`;
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const box = nextFrameBox(frames);
      const f: FrameBox = { id, label: `프레임 ${frames.length + 1}`, description: "", color: FRAME_COLOR_CYCLE[frames.length % FRAME_COLOR_CYCLE.length], order: frames.length, ...box };
      return buildNodes({ nodes: dn, edges: [], frames: [...frames, f] }).nodes;
    });
    setSelFrame(id); setSelNode(null); setSelEdge(null); touch();
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1 }), 40);
  }, [rf, setNodes, touch]);

  const addNode = useCallback((type: FlowNodeType) => {
    setAddMenu(false);
    const { x, y, zoom } = rf.getViewport();
    const el = document.querySelector(".react-flow") as HTMLElement | null;
    const w = el?.clientWidth ?? 800; const h = el?.clientHeight ?? 600;
    const jitter = Math.round(Math.random() * 40);
    const size = FLOW_NODE_SIZE[type];
    const pos = { x: Math.round((-x + w / 2) / zoom - size.width / 2) + jitter, y: Math.round((-y + h / 2) / zoom - size.height / 2) + jitter };
    const id = `n_${rid()}`;
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const hit = frameAtPoint(frames, { x: pos.x + size.width / 2, y: pos.y + size.height / 2 });
      const n: FlowNode = {
        id, type, label: type === "start" ? "시작" : `새 ${FLOW_NODE_LABEL[type]}`, description: "",
        position: hit ? clampToFrame(hit, pos, size) : pos, ...(hit ? { frameId: hit.id } : {}),
      };
      return buildNodes({ nodes: [...dn, n], edges: [], frames }).nodes;
    });
    setSelNode(id); setSelEdge(null); setSelFrame(null); touch();
  }, [rf, setNodes, touch]);

  const autoLayout = useCallback(() => {
    const domainEdges = edges.map(edgeFromRF);
    setNodes((ns) => {
      const { nodes: dn, frames } = toDomain(ns);
      const r = layoutFramedFlow(dn, domainEdges, frames);
      const laid = dn.map((n) => ({ ...n, position: r.positions.get(n.id) ?? n.position }));
      return buildNodes({ nodes: laid, edges: domainEdges, frames: r.frames }).nodes;
    });
    touch();
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1 }), 40);
  }, [edges, rf, setNodes, touch]);

  // ── 파생 상태 ─────────────────────────────────────────────────────────────
  const ui = useMemo<FlowUi>(() => ({
    renameFrame: (id, label) => patchFrame(id, { label }),
    openFrame: (id) => { setSelFrame(id); setSelNode(null); setSelEdge(null); },
    editEdge: (id) => { setSelEdge(id); setSelNode(null); setSelFrame(null); },
    readOnly: false,
  }), [patchFrame]);

  /** 선택된 노드에 붙은 엣지 강조 + hover 라벨 어포던스 (상태에 쓰지 않고 렌더용으로만 파생) */
  const viewEdges = useMemo(() => edges.map((e) => {
    const hot = (!!selNode && (e.source === selNode || e.target === selNode)) || e.id === selEdge;
    const hovered = e.id === hoverEdge;
    return {
      ...e,
      data: { hovered, highlighted: hot },
      style: { stroke: hot ? EDGE_HL : EDGE_BASE, strokeWidth: hot ? 2 : 1.4 },
      markerEnd: { ...(typeof e.markerEnd === "object" ? e.markerEnd : {}), color: hot ? EDGE_HL : EDGE_BASE } as RFEdge["markerEnd"],
      zIndex: hot ? 1 : 0,
    };
  }), [edges, selNode, selEdge, hoverEdge]);

  const frames = useMemo(() => toDomain(nodes).frames, [nodes]);
  const domainNodes = useMemo(() => toDomain(nodes).nodes, [nodes]);
  const selectedNode = useMemo(() => domainNodes.find((n) => n.id === selNode) ?? null, [domainNodes, selNode]);
  const selectedEdge = useMemo(() => { const e = edges.find((x) => x.id === selEdge); return e ? edgeFromRF(e) : null; }, [edges, selEdge]);
  const selectedFrame = useMemo(() => frames.find((f) => f.id === selFrame) ?? null, [frames, selFrame]);
  const startCount = domainNodes.filter((n) => n.type === "start").length;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 min-w-0 relative">
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-1rem)]">
          <div className="relative">
            <button className="btn btn-sm bg-panel shadow-sm" onClick={() => setAddMenu((v) => !v)}><Plus size={13} /> 노드 <ChevronDown size={11} /></button>
            {addMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAddMenu(false)} />
                <div className="absolute left-0 mt-1 w-36 card shadow-lg z-20 py-1 text-sm">
                  {FLOW_NODE_TYPES.map((t) => <button key={t} className="w-full text-left px-3 py-1.5 hover:bg-black/[.03] dark:hover:bg-white/[.04]" onClick={() => addNode(t)}>{FLOW_NODE_LABEL[t]}</button>)}
                </div>
              </>
            )}
          </div>
          <button className="btn btn-sm bg-panel shadow-sm" onClick={addFrame}><SquareDashed size={13} /> 프레임</button>
          <button className="btn btn-sm bg-panel shadow-sm" onClick={autoLayout}><LayoutGrid size={13} /> 자동 정렬</button>
          <span className="text-[11px] text-muted bg-panel/80 rounded px-2 py-1">
            {domainNodes.length}개 노드 · {edges.length}개 연결{frames.length > 0 && ` · ${frames.length}개 프레임`} · {saved ? "저장됨" : "저장 중…"}
          </span>
          {startCount !== 1 && <span className="text-[11px] text-warn bg-warn-soft rounded px-2 py-1">시작 노드는 정확히 1개여야 합니다 (현재 {startCount}개)</span>}
        </div>
        <FlowLegend className="absolute top-2 right-2 z-10" />
        <FlowUiContext.Provider value={ui}>
          <ReactFlow
            nodes={nodes}
            edges={viewEdges}
            nodeTypes={nodeTypes}
            edgeTypes={flowEdgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onEdgeDoubleClick={onEdgeClick}
            onEdgeMouseEnter={(_e, e) => setHoverEdge(e.id)}
            onEdgeMouseLeave={() => setHoverEdge(null)}
            onPaneClick={onPaneClick}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{ type: "flow" }}
            minZoom={0.15}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            className="canvas-dots"
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--dot)" style={{ backgroundColor: "var(--canvas)" }} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-panel" nodeColor={(n) => (n.type === "frame" ? "transparent" : "var(--accent-soft)")} />
          </ReactFlow>
        </FlowUiContext.Provider>
        <div className="absolute bottom-3 left-3 text-[11px] text-muted bg-panel/80 rounded px-2 py-1 pointer-events-none">노드를 프레임 안으로 끌면 그 상황에 속합니다 · 연결선 위 라벨 클릭 → 편집 · Delete → 삭제</div>
      </div>
      {selectedNode && (
        <NodeDrawer node={selectedNode} frames={frames} onChange={(p) => patchNode(selectedNode.id, p)} onFrameChange={(fid) => setNodeFrame(selectedNode.id, fid)}
          onDelete={() => deleteNode(selectedNode.id)}
          onAsk={() => mention({ type: "flow", id: flow.id, label: `${flow.name} · ${selectedNode.label}` })} onClose={() => setSelNode(null)} />
      )}
      {!selectedNode && selectedFrame && (
        <FrameDrawer frame={selectedFrame} count={domainNodes.filter((n) => n.frameId === selectedFrame.id).length}
          onChange={(p) => patchFrame(selectedFrame.id, p)} onDelete={() => deleteFrame(selectedFrame.id)} onClose={() => setSelFrame(null)} />
      )}
      {!selectedNode && !selectedFrame && selectedEdge && (
        <EdgeDrawer edge={selectedEdge} nodes={domainNodes} onChange={(l) => patchEdge(selectedEdge.id, l)} onDelete={() => deleteEdge(selectedEdge.id)} onClose={() => setSelEdge(null)} />
      )}
    </div>
  );
}
