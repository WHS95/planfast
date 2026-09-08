"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowUpRight, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { CHILD_ITEM_TYPE, ITEM_TYPE_LABEL, type Item, type ItemType } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { useFeatures } from "./FeaturesContext";
import { ItemDrawer } from "./ItemDetail";
import { Highlight } from "./Highlight";
import { NewBadge, NumTag } from "./controls";
import { flattenVisible, matchesQuery, tint } from "./utils";
import { stableLayout } from "@/lib/flow/autolayout";
import { useDialog } from "@/components/ui/DialogProvider";

const W = 240;
const NODE_H: Record<ItemType, number> = { requirement: 78, feature: 72, spec: 68 };
const PRD_ID = "__prd__";
const PRD_W = 200;
const PRD_H = 112;

const ENTER = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const } };

// ---------------------------------------------------------------- node data
type ItemNodeData = { item: Item; num: string; color: string; childCount: number; collapsed: boolean; matched: boolean; current: boolean; q: string };
type ItemNode = Node<ItemNodeData, "item">;
type PrdNodeData = { projectId: string; busy: boolean };
type PrdNode = Node<PrdNodeData, "prd">;
type AnyNode = ItemNode | PrdNode;

/** synthetic root — the PRD is not an item, it only anchors the tree on the far left */
function PrdNodeView({ data }: NodeProps<PrdNode>) {
  const { aiGenerate } = useFeatures();
  return (
    <motion.div {...ENTER} className="card px-3 py-2.5 flex flex-col gap-2" style={{ width: PRD_W, height: PRD_H, borderColor: "var(--line-strong)" }}>
      <Handle type="source" position={Position.Right} className="!bg-line !border-0 !w-2 !h-2" />
      <Link href={`/p/${data.projectId}/prd`} className="nodrag flex items-center gap-1 text-sm font-semibold hover:text-accent transition-colors w-fit">
        PRD <ArrowUpRight size={13} className="text-muted" />
      </Link>
      <p className="text-[11px] text-muted leading-tight">PRD를 근거로 요구사항 → 기능 → 상세기능을 한 번에 제안합니다.</p>
      <button className="nodrag btn btn-sm btn-primary mt-auto justify-center" disabled={data.busy} onClick={(e) => { e.stopPropagation(); aiGenerate(null); }}>
        {data.busy ? <Spinner className="w-3 h-3" /> : <Sparkles size={12} />} 모든 하위 항목 생성
      </button>
    </motion.div>
  );
}

function ItemNodeView({ data, selected }: NodeProps<ItemNode>) {
  const { confirm } = useDialog();
  const { item, num, color, childCount, collapsed, matched, current, q } = data;
  const { store, toggleCollapse, addChild, removeItem } = useFeatures();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const childType = CHILD_ITEM_TYPE[item.type];
  const isReq = item.type === "requirement";
  const commit = () => { setEditing(false); if (draft !== item.title) store.update(item.id, { title: draft }); };

  return (
    <motion.div
      {...ENTER}
      className="group relative rounded-lg bg-panel px-3 py-2 flex flex-col"
      style={{
        width: W,
        height: NODE_H[item.type],
        border: `${isReq ? 1.5 : 1}px ${item.aiProposed ? "dashed" : "solid"} ${isReq ? color : tint(color, 38, "var(--line)")}`,
        background: isReq ? tint(color, 7) : "var(--panel)",
        boxShadow: selected
          ? `0 0 0 2px var(--accent), var(--shadow-2)`
          : current ? `0 0 0 3px #fbbf24, var(--shadow-1)` : matched ? `0 0 0 2px #fbbf24, var(--shadow-1)` : "var(--shadow-1)",
      }}
    >
      {item.type !== "requirement" && <Handle type="target" position={Position.Left} className="!bg-line !border-0 !w-2 !h-2" />}
      {childType && <Handle type="source" position={Position.Right} className="!bg-line !border-0 !w-2 !h-2" />}
      {/* left accent bar */}
      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: color, opacity: isReq ? 1 : 0.45 }} />
      {/* right dot */}
      <span className="absolute right-2.5 top-2.5 w-1.5 h-1.5 rounded-full" style={{ background: color, opacity: isReq ? 1 : 0.55 }} />

      <div className="flex items-center gap-1 min-w-0 pr-4">
        <NumTag n={num} />
        <span className="text-[10px] text-muted truncate">{ITEM_TYPE_LABEL[item.type]}</span>
        {item.aiProposed && <NewBadge />}
      </div>

      {editing ? (
        <input autoFocus className="nodrag nopan input !py-0.5 !px-1 text-[13px] mt-0.5 w-full" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) commit(); if (e.key === "Escape") { setDraft(item.title); setEditing(false); } }}
          onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} />
      ) : (
        <div className={clsx("text-[13px] mt-0.5 leading-snug line-clamp-2 pr-4", isReq ? "font-semibold" : "font-medium")} title="더블클릭하여 이름 변경"
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(item.title); setEditing(true); }}>
          {item.title ? <Highlight text={item.title} q={q} /> : <span className="text-muted font-normal">(제목 없음)</span>}
        </div>
      )}

      {/* hover toolbar */}
      <div className="nodrag absolute right-1.5 bottom-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {childType && (
          <button className="btn btn-icon !p-1 bg-panel border" title={`하위 ${ITEM_TYPE_LABEL[childType]} 추가`} onClick={(e) => { e.stopPropagation(); void addChild(item.id); }}>
            <Plus size={11} />
          </button>
        )}
        <button className="btn btn-icon !p-1 bg-panel border hover:text-danger" title="삭제"
          onClick={async (e) => { e.stopPropagation(); if (await confirm({ message: `'${item.title || "(제목 없음)"}' 항목과 하위 항목을 삭제할까요?`, confirmLabel: "삭제", danger: true })) void removeItem(item.id); }}>
          <Trash2 size={11} />
        </button>
      </div>

      {childCount > 0 && (
        <button
          className={clsx("nodrag absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border bg-panel text-[10px] font-medium flex items-center justify-center transition-colors hover:border-accent hover:text-accent")}
          style={collapsed ? { borderColor: color, color } : undefined}
          title={collapsed ? "펼치기" : "접기"} onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}>
          {collapsed ? childCount : <ChevronRight size={12} className="rotate-180" />}
        </button>
      )}
    </motion.div>
  );
}

const nodeTypes = { item: ItemNodeView, prd: PrdNodeView };

/**
 * 프로젝트별 직전 배치 좌표(힌트 캐시).
 *
 * 트리는 항목 데이터에서 매번 새로 계산되므로 저장된 좌표가 없다. 그런데 그대로 두면 항목 하나를
 * 펼치거나 추가할 때마다 화면 전체가 재배치돼 사용자가 흐름을 다시 읽어야 한다.
 * 그래서 직전 결과를 기준으로 삼아 바뀐 가지만 움직이게 한다.
 *
 * ref 나 state 대신 모듈 스코프인 이유: 이 값을 ref 로 두면 렌더 중 읽기(react-hooks/refs),
 * state 로 두면 effect 안 setState(react-hooks/set-state-in-effect) 에 걸린다.
 * 없어도 배치는 정상 동작하는 **힌트**일 뿐이라 캐시로 두는 편이 의미상으로도 맞다.
 * (읽기는 렌더에서, 쓰기는 effect 에서만 한다)
 */
const layoutMemory = new Map<string, Map<string, { x: number; y: number }>>();

/**
 * 트리 배치. 요구사항 하나에 상세기능이 20개씩 달리면 일반 트리 배치는 그걸 한 줄로 늘려 화면을 통째로 먹는다.
 * stableLayout 은 주 흐름을 직선으로 두고, 형제가 많으면 격자로 접는다.
 * `previous` 를 넘기면 항목을 하나 추가해도 다른 가지가 움직이지 않는다.
 */
function layout(nodes: AnyNode[], edges: Edge[], previous?: Map<string, { x: number; y: number }>): AnyNode[] {
  const dim = (n: AnyNode) => (n.type === "prd" ? { width: PRD_W, height: PRD_H } : { width: W, height: NODE_H[(n as ItemNode).data.item.type] });
  const r = stableLayout(
    nodes.map((n) => ({ id: n.id, ...dim(n) })),
    edges.map((e) => ({ source: e.source, target: e.target })),
    { direction: "LR", nodesep: 16, ranksep: 84, fanoutWrap: 6, previous },
  );
  return nodes.map((n) => ({ ...n, position: r.positions.get(n.id) ?? n.position ?? { x: 0, y: 0 } }) as AnyNode);
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

/** dot grid that pans/zooms with the canvas (uses the shared `.canvas-dots` utility) */
function DotGrid() {
  const { x, y, zoom } = useViewport();
  const s = 20 * zoom;
  return <div className="canvas-dots absolute inset-0 pointer-events-none" style={{ backgroundSize: `${s}px ${s}px`, backgroundPosition: `${x}px ${y}px` }} />;
}

function Canvas() {
  const { projectId, store, selectedId, select, setView, collapsed, query, currentMatchId, numbers, colors, aiBusy, aiBusyParentId } = useFeatures();
  const { fitView } = useReactFlow();
  const dark = useDark();
  const visible = useMemo(() => flattenVisible(store.items, collapsed), [store.items, collapsed]);

  const { nodes, edges } = useMemo(() => {
    const ids = new Set(visible.map((v) => v.item.id));
    const ns: AnyNode[] = [
      { id: PRD_ID, type: "prd", position: { x: 0, y: 0 }, selectable: false, draggable: false, data: { projectId, busy: aiBusy && aiBusyParentId === null } },
      ...visible.map(({ item }): ItemNode => ({
        id: item.id, type: "item", position: { x: 0, y: 0 }, selected: item.id === selectedId,
        data: {
          item, num: numbers.get(item.id) ?? "", color: colors.get(item.id) ?? "var(--accent)",
          childCount: store.children(item.id).length, collapsed: collapsed.has(item.id),
          matched: matchesQuery(item, query), current: item.id === currentMatchId, q: query,
        },
      })),
    ];
    const es: Edge[] = visible
      .filter((v) => !v.item.parentId || ids.has(v.item.parentId))
      .map((v) => {
        const stroke = colors.get(v.item.id) ?? "var(--line-strong)";
        return {
          id: `e-${v.item.id}`, source: v.item.parentId ?? PRD_ID, target: v.item.id, type: "default",
          style: { stroke, strokeWidth: 1.5, opacity: v.item.parentId ? 0.55 : 0.35 },
        };
      });
    return { nodes: layout(ns, es, layoutMemory.get(projectId)), edges: es };
  }, [visible, store, collapsed, selectedId, query, currentMatchId, numbers, colors, projectId, aiBusy, aiBusyParentId]);

  // 이번 배치를 다음 배치의 기준으로 남긴다 → 항목을 펼치거나 추가해도 다른 가지가 제자리에 있다.
  useEffect(() => { layoutMemory.set(projectId, new Map(nodes.map((n) => [n.id, n.position]))); }, [nodes, projectId]);

  // fit when the visible set changes; centre on current search match
  const key = visible.map((v) => v.item.id).join(",");
  useEffect(() => { const t = setTimeout(() => void fitView({ padding: 0.2, duration: 250 }), 30); return () => clearTimeout(t); }, [key, fitView]);
  useEffect(() => { if (currentMatchId) void fitView({ nodes: [{ id: currentMatchId }], duration: 250, maxZoom: 1.2 }); }, [currentMatchId, fitView]);

  const selected = selectedId ? store.byId.get(selectedId) : undefined;

  return (
    <div className="flex-1 relative min-h-0 bg-canvas overflow-hidden">
      <DotGrid />
      <ReactFlow<AnyNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={dark ? "dark" : "light"} fitView
        nodesDraggable={false} nodesConnectable={false} elementsSelectable style={{ background: "transparent" }}
        onNodeClick={(e, n) => { if (n.type === "prd") return; select(n.id); if (e.shiftKey) setView("dir"); }}
        onPaneClick={() => select(null)} minZoom={0.1} proOptions={{ hideAttribution: true }}>
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={0} nodeBorderRadius={6}
          nodeColor={(n) => (n.type === "prd" ? "var(--line-strong)" : colors.get(n.id) ?? "var(--line-strong)")}
          maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
          style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, opacity: 0.9 }} />
      </ReactFlow>
      {store.items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-sm text-muted card px-6 py-4 pointer-events-auto">아직 항목이 없습니다. 왼쪽 PRD 노드의 ‘모든 하위 항목 생성’으로 시작하세요.</div>
        </div>
      )}
      <AnimatePresence>
        {selected && <ItemDrawer key="drawer" item={selected} onClose={() => select(null)} />}
      </AnimatePresence>
    </div>
  );
}

export function TreeView() {
  return <ReactFlowProvider><Canvas /></ReactFlowProvider>;
}
