"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type EdgeMouseHandler, type NodeMouseHandler, type OnNodesDelete, type OnEdgesDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronDown, LayoutGrid, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { rid, FLOW_NODE_LABEL, FLOW_NODE_TYPES, type Flow, type FlowEdge, type FlowNode, type FlowNodeType } from "@/lib/types";
import { layoutFlow, FLOW_NODE_SIZE } from "@/lib/flow/layout";
import { useEditor, broadcastChange } from "@/components/editor/EditorContext";
import { flowNodeTypes, type RFNode } from "./FlowNodes";
import { NodeDrawer, EdgeDrawer } from "./FlowDrawer";

interface Props { projectId: string; flow: Flow; onSaved: (f: Flow) => void }

export function FlowCanvas(props: Props) {
  return <ReactFlowProvider><Inner key={props.flow.id} {...props} /></ReactFlowProvider>;
}

const toRF = (n: FlowNode): RFNode => ({ id: n.id, type: n.type, position: n.position, data: { label: n.label, description: n.description, kind: n.type }, ...FLOW_NODE_SIZE[n.type] });
const toRFEdge = (e: FlowEdge): Edge => ({ id: e.id, source: e.source, target: e.target, label: e.label, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 }, style: { strokeWidth: 1.5 }, labelStyle: { fontSize: 11 }, labelBgStyle: { fill: "var(--panel)" }, labelBgPadding: [4, 2] as [number, number] });
const fromRF = (n: RFNode): FlowNode => ({ id: n.id, type: n.data.kind, label: n.data.label, description: n.data.description, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } });
const fromRFEdge = (e: Edge): FlowEdge => ({ id: e.id, source: e.source, target: e.target, ...(typeof e.label === "string" && e.label ? { label: e.label } : {}) });

function Inner({ projectId, flow, onSaved }: Props) {
  const rf = useReactFlow();
  const { setSelection, mention } = useEditor();
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(flow.nodes.map(toRF));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flow.edges.map(toRFEdge));
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [saved, setSaved] = useState(true);
  const dirty = useRef(false);
  const lastSaved = useRef(flow.updatedAt);

  // external change (other tab / manny) → re-seed if we're not mid-edit
  useEffect(() => {
    if (flow.updatedAt === lastSaved.current || dirty.current) return;
    lastSaved.current = flow.updatedAt;
    setNodes(flow.nodes.map(toRF)); setEdges(flow.edges.map(toRFEdge));
  }, [flow, setNodes, setEdges]);

  // debounced autosave: touch() just flags dirty; the effect below (keyed on nodes/edges)
  // performs the actual save 700ms after the last change, without holding node/edge data in a ref.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      api<Flow>(`/api/projects/${projectId}/flows/${flow.id}`, { method: "PATCH", json: { nodes: nodes.map(fromRF), edges: edges.map(fromRFEdge) } })
        .then((f) => { lastSaved.current = f.updatedAt; dirty.current = false; setSaved(true); onSaved(f); broadcastChange(projectId); })
        .catch((e) => alert((e as Error).message));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, projectId, flow.id]);
  const touch = useCallback(() => { dirty.current = true; setSaved(false); }, []);

  // persist positions after drag, and on structural changes
  const onNodeDragStop = useCallback(() => touch(), [touch]);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setEdges((es) => addEdge(toRFEdge({ id: `e_${rid()}`, source: c.source!, target: c.target! }), es)); touch();
  }, [setEdges, touch]);
  const onNodesDelete: OnNodesDelete = useCallback((deleted) => { if (deleted.some((d) => d.id === selNode)) setSelNode(null); touch(); }, [selNode, touch]);
  const onEdgesDelete: OnEdgesDelete = useCallback((deleted) => { if (deleted.some((d) => d.id === selEdge)) setSelEdge(null); touch(); }, [selEdge, touch]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, n) => {
    setSelNode(n.id); setSelEdge(null);
    const d = (n as RFNode).data;
    setSelection({ type: "flow", id: flow.id, label: `${flow.name} · ${d.label}` });
  }, [flow.id, flow.name, setSelection]);
  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((_e, e) => { setSelEdge(e.id); setSelNode(null); }, []);
  const onPaneClick = useCallback(() => { setSelNode(null); setSelEdge(null); setSelection(null); }, [setSelection]);

  function patchNode(id: string, patch: Partial<Pick<FlowNode, "label" | "description" | "type">>) {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      const kind = patch.type ?? n.data.kind;
      return { ...n, type: kind, ...FLOW_NODE_SIZE[kind], data: { ...n.data, kind, label: patch.label ?? n.data.label, description: patch.description ?? n.data.description } };
    }));
    touch();
  }
  function deleteNode(id: string) { rf.deleteElements({ nodes: [{ id }] }); setSelNode(null); }
  function patchEdge(id: string, label: string) { setEdges((es) => es.map((e) => (e.id === id ? { ...e, label } : e))); touch(); }
  function deleteEdge(id: string) { rf.deleteElements({ edges: [{ id }] }); setSelEdge(null); }

  const addNode = useCallback((type: FlowNodeType) => {
    setAddMenu(false);
    const { x, y, zoom } = rf.getViewport();
    const el = document.querySelector(".react-flow") as HTMLElement | null;
    const w = el?.clientWidth ?? 800; const h = el?.clientHeight ?? 600;
    const jitter = Math.round(Math.random() * 40);
    const pos = { x: Math.round((-x + w / 2) / zoom - FLOW_NODE_SIZE[type].width / 2) + jitter, y: Math.round((-y + h / 2) / zoom - FLOW_NODE_SIZE[type].height / 2) + jitter };
    const n: FlowNode = { id: `n_${rid()}`, type, label: type === "start" ? "시작" : `새 ${FLOW_NODE_LABEL[type]}`, description: "", position: pos };
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...toRF(n), selected: true }]);
    setSelNode(n.id); setSelEdge(null); touch();
  }, [rf, setNodes, touch]);
  function autoLayout() {
    const pos = layoutFlow(nodes.map((n) => ({ id: n.id, type: n.data.kind })), edges);
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    touch();
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 250, maxZoom: 1 }), 30);
  }

  const selectedNode = useMemo(() => { const n = nodes.find((x) => x.id === selNode); return n ? fromRF(n) : null; }, [nodes, selNode]);
  const selectedEdge = useMemo(() => { const e = edges.find((x) => x.id === selEdge); return e ? fromRFEdge(e) : null; }, [edges, selEdge]);
  const domainNodes = useMemo(() => nodes.map(fromRF), [nodes]);
  const startCount = nodes.filter((n) => n.data.kind === "start").length;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 min-w-0 relative">
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
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
          <button className="btn btn-sm bg-panel shadow-sm" onClick={autoLayout}><LayoutGrid size={13} /> 자동 정렬</button>
          <span className="text-[11px] text-muted bg-panel/80 rounded px-2 py-1">{nodes.length}개 노드 · {edges.length}개 연결 · {saved ? "저장됨" : "저장 중…"}</span>
          {startCount !== 1 && <span className="text-[11px] text-warn bg-warn-soft rounded px-2 py-1">시작 노드는 정확히 1개여야 합니다 (현재 {startCount}개)</span>}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={flowNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={onNodeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeClick={(_e, e) => { setSelEdge(e.id); setSelNode(null); }}
          onPaneClick={onPaneClick}
          deleteKeyCode={["Backspace", "Delete"]}
          defaultEdgeOptions={{ type: "smoothstep" }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        >
          <Background gap={20} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-panel" nodeColor={() => "var(--accent-soft)"} />
        </ReactFlow>
        <div className="absolute bottom-3 left-3 text-[11px] text-muted bg-panel/80 rounded px-2 py-1 pointer-events-none">노드 클릭 → 편집 · 연결선 더블클릭 → 라벨 편집 · Delete → 삭제 · 오른쪽 점을 끌어 연결</div>
      </div>
      {selectedNode && (
        <NodeDrawer node={selectedNode} onChange={(p) => patchNode(selectedNode.id, p)} onDelete={() => deleteNode(selectedNode.id)}
          onAsk={() => mention({ type: "flow", id: flow.id, label: `${flow.name} · ${selectedNode.label}` })} onClose={() => setSelNode(null)} />
      )}
      {!selectedNode && selectedEdge && (
        <EdgeDrawer edge={selectedEdge} nodes={domainNodes} onChange={(l) => patchEdge(selectedEdge.id, l)} onDelete={() => deleteEdge(selectedEdge.id)} onClose={() => setSelEdge(null)} />
      )}
    </div>
  );
}
