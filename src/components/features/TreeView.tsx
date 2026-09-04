"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import dagre from "@dagrejs/dagre";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeMouseHandler, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { CHILD_ITEM_TYPE, ITEM_TYPE_LABEL, type Item } from "@/lib/types";
import { PriorityDot, StatusBadge } from "@/components/ui";
import { useFeatures } from "./FeaturesContext";
import { ItemDetail } from "./ItemDetail";
import { Highlight } from "./Highlight";
import { TYPE_CLASS, flattenVisible, matchesQuery } from "./utils";

const W = 240;
const H = 84;

type ItemNodeData = { item: Item; childCount: number; collapsed: boolean; matched: boolean; current: boolean; q: string };
type ItemNode = Node<ItemNodeData, "item">;

function ItemNodeView({ data, selected }: NodeProps<ItemNode>) {
  const { item, childCount, collapsed, matched, current, q } = data;
  const { store, toggleCollapse, addChild, removeItem } = useFeatures();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const childType = CHILD_ITEM_TYPE[item.type];
  const commit = () => { setEditing(false); if (draft !== item.title) store.update(item.id, { title: draft }); };
  return (
    <div
      className={clsx("group card px-3 py-2 shadow-sm relative transition-shadow", selected && "ring-2 ring-accent", !selected && matched && "ring-2 ring-amber-400", current && "ring-4 ring-amber-400")}
      style={{ width: W, height: H }}
    >
      {item.type !== "requirement" && <Handle type="target" position={Position.Left} className="!bg-line !border-0 !w-2 !h-2" />}
      {childType && <Handle type="source" position={Position.Right} className="!bg-line !border-0 !w-2 !h-2" />}
      <div className="flex items-center gap-1.5">
        <span className={clsx("chip border-transparent", TYPE_CLASS[item.type])}>{ITEM_TYPE_LABEL[item.type]}</span>
        <PriorityDot priority={item.priority} />
        <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity nodrag">
          {childType && <button className="btn btn-icon !p-1" title={`하위 ${ITEM_TYPE_LABEL[childType]} 추가`} onClick={(e) => { e.stopPropagation(); void addChild(item.id); }}><Plus size={12} /></button>}
          <button className="btn btn-icon !p-1 hover:text-danger" title="삭제" onClick={(e) => { e.stopPropagation(); if (confirm(`'${item.title || "(제목 없음)"}' 항목과 하위 항목을 삭제할까요?`)) void removeItem(item.id); }}><Trash2 size={12} /></button>
        </div>
      </div>
      {editing ? (
        <input autoFocus className="nodrag nopan input !py-0.5 !px-1 text-sm mt-1 w-full" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(item.title); setEditing(false); } }} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} />
      ) : (
        <div className="text-sm font-medium mt-1 truncate" title="더블클릭하여 이름 변경" onDoubleClick={(e) => { e.stopPropagation(); setDraft(item.title); setEditing(true); }}>
          {item.title ? <Highlight text={item.title} q={q} /> : <span className="text-muted">(제목 없음)</span>}
        </div>
      )}
      <div className="mt-1"><StatusBadge status={item.status} /></div>
      {childCount > 0 && (
        <button
          className={clsx("nodrag absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border bg-panel text-[10px] flex items-center justify-center hover:bg-accent-soft", collapsed && "text-accent border-accent")}
          title={collapsed ? "펼치기" : "접기"} onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}>
          {collapsed ? childCount : <ChevronRight size={12} className="rotate-180" />}
        </button>
      )}
    </div>
  );
}
const nodeTypes = { item: ItemNodeView };

function layout(nodes: ItemNode[], edges: Edge[]): ItemNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 80 });
  for (const n of nodes) g.setNode(n.id, { width: W, height: H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => { const p = g.node(n.id); return { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } }; });
}

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const upd = () => setDark(el.classList.contains("dark"));
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function Canvas() {
  const { store, selectedId, select, setView, collapsed, query, currentMatchId } = useFeatures();
  const { fitView } = useReactFlow();
  const dark = useDark();
  const visible = useMemo(() => flattenVisible(store.items, collapsed), [store.items, collapsed]);
  const { nodes, edges } = useMemo(() => {
    const ids = new Set(visible.map((v) => v.item.id));
    const ns: ItemNode[] = visible.map(({ item }) => ({
      id: item.id, type: "item", position: { x: 0, y: 0 }, selected: item.id === selectedId,
      data: { item, childCount: store.children(item.id).length, collapsed: collapsed.has(item.id), matched: matchesQuery(item, query), current: item.id === currentMatchId, q: query },
    }));
    const es: Edge[] = visible.filter((v) => v.item.parentId && ids.has(v.item.parentId)).map((v) => ({ id: `e-${v.item.id}`, source: v.item.parentId!, target: v.item.id, type: "smoothstep" }));
    return { nodes: layout(ns, es), edges: es };
  }, [visible, store, collapsed, selectedId, query, currentMatchId]);

  // fit when the visible set changes; centre on current search match
  const key = visible.map((v) => v.item.id).join(",");
  useEffect(() => { const t = setTimeout(() => void fitView({ padding: 0.2, duration: 250 }), 30); return () => clearTimeout(t); }, [key, fitView]);
  useEffect(() => { if (currentMatchId) void fitView({ nodes: [{ id: currentMatchId }], duration: 250, maxZoom: 1.2 }); }, [currentMatchId, fitView]);

  const onNodeClick: NodeMouseHandler<ItemNode> = (e, n) => { select(n.id); if (e.shiftKey) setView("dir"); };
  const selected = selectedId ? store.byId.get(selectedId) : undefined;

  return (
    <div className="flex-1 relative min-h-0">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={dark ? "dark" : "light"} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable
        onNodeClick={onNodeClick} onPaneClick={() => select(null)} minZoom={0.1} proOptions={{ hideAttribution: true }}>
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
      {store.items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-sm text-muted card px-6 py-4 pointer-events-auto">아직 항목이 없습니다. ‘+ 요구사항 추가’ 또는 ‘매니로 기능 생성’으로 시작하세요.</div>
        </div>
      )}
      {selected && (
        <div className="absolute right-0 top-0 bottom-0 w-[380px] border-l bg-panel shadow-xl z-10 flex flex-col">
          <ItemDetail item={selected} onClose={() => select(null)} />
        </div>
      )}
    </div>
  );
}

export function TreeView() {
  return <ReactFlowProvider><Canvas /></ReactFlowProvider>;
}
