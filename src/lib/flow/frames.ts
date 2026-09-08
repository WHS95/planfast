/**
 * 유저플로우 "프레임"(스윔레인) 기하 + 자동 배치.
 *
 * types.ts 의 `FlowFrame`은 의미 정보(label/description/color/order)만 갖는다.
 * 캔버스에 그리려면 좌표·크기가 필요해서 이 모듈에서 `FrameBox`(= FlowFrame + x/y/w/h)로 확장한다.
 * x/y/w/h 는 flows.frames JSON 에 그대로 함께 저장/복원된다. (types.ts 는 건드리지 않음)
 *
 * 노드의 `position`은 항상 **캔버스 절대 좌표**로 저장한다. React Flow 의 parent/child 상대 좌표
 * 변환은 캔버스 컴포넌트에서만 수행한다 → PNG 내보내기·공유 뷰 등 기존 소비자가 그대로 동작.
 */
import type { FlowEdge, FlowFrame, FlowNode } from "@/lib/types";
import { FLOW_NODE_SIZE } from "./layout";
import { stableLayout } from "./autolayout";

export interface FrameBox extends FlowFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 레인 안쪽 여백. top 은 라벨 자리. */
export const FRAME_PAD = { top: 46, right: 32, bottom: 28, left: 32 } as const;
export const FRAME_GAP = 28;
export const FRAME_MIN_W = 720;
export const FRAME_MIN_H = 150;
/** 프레임에 속하지 않은 노드를 감싸는 암묵 레인 (저장되지 않음) */
export const OTHER_FRAME_ID = "__other__";
export const OTHER_FRAME_LABEL = "기타";

export const FRAME_COLORS = ["neutral", "violet", "sky", "amber", "emerald", "rose"] as const;
export type FrameColor = (typeof FRAME_COLORS)[number];
export const FRAME_COLOR_LABEL: Record<FrameColor, string> = {
  neutral: "기본", violet: "보라", sky: "파랑", amber: "노랑", emerald: "초록", rose: "분홍",
};
/** rgb 채널 문자열. neutral 은 배경/전경 대비만 쓰도록 빈 값. */
const HUE: Record<FrameColor, string> = {
  neutral: "", violet: "139,92,246", sky: "14,165,233", amber: "245,158,11", emerald: "16,185,129", rose: "244,63,94",
};
/** 자동 생성 프레임에 순서대로 부여되는 색 */
export const FRAME_COLOR_CYCLE: FrameColor[] = ["violet", "sky", "amber", "emerald", "rose", "neutral"];

export const isFrameColor = (c: string | undefined): c is FrameColor => !!c && (FRAME_COLORS as readonly string[]).includes(c);

/** 레인 배경/테두리/점 색. neutral 은 index 로 옅은 배경을 번갈아 준다. */
export function frameTint(color: string | undefined, index: number) {
  const c: FrameColor = isFrameColor(color) ? color : "neutral";
  if (c === "neutral") {
    const a = index % 2 === 0 ? 0.022 : 0.045;
    return { bg: `color-mix(in srgb, var(--fg) ${(a * 100).toFixed(1)}%, transparent)`, dot: "var(--muted)" };
  }
  return { bg: `rgba(${HUE[c]},0.07)`, dot: `rgb(${HUE[c]})` };
}

export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** 저장된 frames(JSON) → FrameBox[]. 좌표가 없으면 NaN 대신 0 을 채우고 `needsLayout` 로 알린다. */
export function toBoxes(frames: FlowFrame[]): FrameBox[] {
  return [...frames].sort(byOrder).map((f, i) => {
    const b = f as Partial<FrameBox> & FlowFrame;
    return {
      ...f,
      order: typeof f.order === "number" ? f.order : i,
      x: num(b.x, 0), y: num(b.y, 0), w: num(b.w, FRAME_MIN_W), h: num(b.h, FRAME_MIN_H),
    };
  });
}
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
/** 좌표가 하나라도 비어 있으면 최초 렌더 시 자동 배치가 필요하다. */
export const needsLayout = (frames: FlowFrame[]) =>
  frames.some((f) => {
    const b = f as Partial<FrameBox>;
    return typeof b.x !== "number" || typeof b.y !== "number" || typeof b.w !== "number" || typeof b.h !== "number";
  });

export const nodeSize = (n: { type: FlowNode["type"] }) => FLOW_NODE_SIZE[n.type];

/**
 * 프레임 단위 자동 배치.
 * 프레임마다 내부 노드를 stableLayout(LR)로 정렬하고, 프레임을 같은 너비의 가로 레인으로 위→아래 적층한다.
 * 프레임이 없는 노드는 맨 아래에 (암묵 "기타" 레인 자리) 배치한다.
 * 반환 position 은 모두 절대 좌표.
 */
export function layoutFramedFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  frames: FlowFrame[],
): { positions: Map<string, { x: number; y: number }>; frames: FrameBox[] } {
  const boxes = toBoxes(frames);
  const known = new Set(boxes.map((f) => f.id));
  const groups: { id: string | null; nodes: FlowNode[] }[] = boxes.map((f) => ({ id: f.id, nodes: [] as FlowNode[] }));
  const loose: FlowNode[] = [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const n of nodes) {
    const g = n.frameId && known.has(n.frameId) ? byId.get(n.frameId) : undefined;
    if (g) g.nodes.push(n); else loose.push(n);
  }
  if (loose.length) groups.push({ id: null, nodes: loose });

  // 1) 프레임별 내부 배치 (그룹 내부 edge 만 사용)
  const local = new Map<string, { x: number; y: number }>();
  const sizes = groups.map((g) => {
    const ids = new Set(g.nodes.map((n) => n.id));
    const inner = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    // 프레임 안에서만 배치한다(레인 밖 간선은 제외) — 그래야 다른 레인이 이 레인을 끌어당기지 않는다.
    const pos = stableLayout(g.nodes.map((n) => ({ id: n.id, ...nodeSize(n) })), inner,
      { direction: "LR", nodesep: 36, ranksep: 90, fanoutWrap: 6 }).positions;
    let w = 0, h = 0, minX = Infinity, minY = Infinity;
    for (const n of g.nodes) {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    }
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; }
    for (const n of g.nodes) {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      const s = nodeSize(n);
      const lx = p.x - minX, ly = p.y - minY;
      local.set(n.id, { x: lx, y: ly });
      w = Math.max(w, lx + s.width); h = Math.max(h, ly + s.height);
    }
    return { w, h };
  });

  // 2) 모든 레인은 같은 너비
  const laneW = Math.max(FRAME_MIN_W, ...sizes.map((s) => s.w + FRAME_PAD.left + FRAME_PAD.right));

  // 3) 위→아래로 적층
  const positions = new Map<string, { x: number; y: number }>();
  const out: FrameBox[] = [];
  let cursor = 0;
  groups.forEach((g, i) => {
    const h = Math.max(FRAME_MIN_H, sizes[i].h + FRAME_PAD.top + FRAME_PAD.bottom);
    const ox = FRAME_PAD.left;
    const oy = cursor + FRAME_PAD.top;
    for (const n of g.nodes) {
      const p = local.get(n.id) ?? { x: 0, y: 0 };
      positions.set(n.id, { x: Math.round(ox + p.x), y: Math.round(oy + p.y) });
    }
    if (g.id) {
      const src = boxes.find((b) => b.id === g.id)!;
      out.push({ ...src, order: out.length, x: 0, y: cursor, w: laneW, h });
    }
    cursor += h + FRAME_GAP;
  });
  return { positions, frames: out };
}

/** 절대 좌표 점을 포함하는 프레임 (뒤쪽=위에 그려진 것 우선) */
export function frameAtPoint(frames: FrameBox[], p: { x: number; y: number }): FrameBox | undefined {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f;
  }
  return undefined;
}

/** 노드(절대 좌표)를 프레임 안쪽으로 가둔다. */
export function clampToFrame(f: FrameBox, pos: { x: number; y: number }, size: { width: number; height: number }) {
  const maxX = Math.max(f.x + 8, f.x + f.w - size.width - 12);
  const maxY = Math.max(f.y + FRAME_PAD.top, f.y + f.h - size.height - 12);
  return {
    x: Math.round(Math.min(Math.max(pos.x, f.x + 12), maxX)),
    y: Math.round(Math.min(Math.max(pos.y, f.y + FRAME_PAD.top), maxY)),
  };
}

/** 프레임 밖 노드들을 감싸는 암묵 "기타" 레인. 노드가 없으면 null. */
export function implicitFrame(nodes: FlowNode[], frames: FrameBox[]): FrameBox | null {
  const known = new Set(frames.map((f) => f.id));
  const loose = nodes.filter((n) => !n.frameId || !known.has(n.frameId));
  if (!loose.length || !frames.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of loose) {
    const s = nodeSize(n);
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + s.width); maxY = Math.max(maxY, n.position.y + s.height);
  }
  const laneW = Math.max(FRAME_MIN_W, ...frames.map((f) => f.w));
  const x = Math.min(...frames.map((f) => f.x), minX - FRAME_PAD.left);
  return {
    id: OTHER_FRAME_ID, label: OTHER_FRAME_LABEL, description: "", color: "neutral", order: frames.length + 1,
    x, y: minY - FRAME_PAD.top,
    w: Math.max(laneW, maxX + FRAME_PAD.right - x),
    h: Math.max(FRAME_MIN_H, maxY - minY + FRAME_PAD.top + FRAME_PAD.bottom),
  };
}

/** 새 프레임을 기존 레인 아래에 붙일 위치/크기 */
export function nextFrameBox(frames: FrameBox[]): Pick<FrameBox, "x" | "y" | "w" | "h"> {
  if (!frames.length) return { x: 0, y: 0, w: FRAME_MIN_W, h: FRAME_MIN_H };
  const w = Math.max(FRAME_MIN_W, ...frames.map((f) => f.w));
  const x = Math.min(...frames.map((f) => f.x));
  const y = Math.max(...frames.map((f) => f.y + f.h)) + FRAME_GAP;
  return { x, y, w, h: FRAME_MIN_H };
}
