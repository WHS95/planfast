/**
 * 안정적인 자동 정렬 엔진 (정보구조도 · 기능명세서 트리 · 유저플로우 공용).
 *
 * 목표는 "모든 선을 한 화면에 예쁘게" 가 아니라 **"주요 흐름을 유지하면서 영향 범위를 국소화"** 다.
 * 일반 dagre 호출과 다르게 다음을 지킨다.
 *
 *  ① 主 흐름(spine)은 직선으로 — 가장 긴 사슬을 골라 부모와 같은 축에 둔다.
 *  ② 분기는 하나의 블록으로 — 자식 서브트리를 통째로 배치 단위(Block)로 다루고 그 안에서만 압축한다.
 *  ③ 분기가 많으면 접는다 — 형제가 fanoutWrap 을 넘으면 한 줄로 늘리지 않고 격자로 접는다.
 *     30개 분기를 한 줄로 펼치면 그것만으로 화면을 통째로 먹는다.
 *  ④ 영역을 넘는 간선(cross edge)은 배치 그래프에서 뺀다 — 트리가 아니라 DAG 라서, 이 간선을 배치에
 *     넣으면 상관없는 두 영역이 서로를 끌어당겨 전체가 뒤틀린다. 위치는 트리로 잡고 선은 그냥 잇는다.
 *  ⑤ 기존 위치를 지킨다 — `previous` 를 주면 (a) 전체를 원래 자리에 앵커하고 (b) 구성원이 그대로인
 *     서브트리는 예전 좌표를 그대로 쓴다. 새 노드가 들어간 가지만 다시 배치된다.
 *
 * **`previous` 를 줄 때와 주지 않을 때가 다르다.**
 *   - 주지 않음 = "자동 정렬" 버튼. 사용자가 명시적으로 전체 재배치를 요청한 것이므로 깨끗하게 새로 잡는다.
 *   - 줌 = 노드가 새로 생겨 자리를 잡아야 할 때. 기존 배치는 건드리지 않고 새 노드만 끼워 넣는다.
 *
 * 좌표는 내부적으로 (a=흐름 축, c=교차 축)으로 계산하고 마지막에 direction 에 맞춰 x/y 로 바꾼다.
 * LR 이면 a=x, c=y / TB 면 a=y, c=x.
 */

export interface LayoutNodeSize { id: string; width: number; height: number }
export interface LayoutEdgeRef { source: string; target: string }
export interface Point { x: number; y: number }

export interface StableLayoutOptions {
  direction?: "TB" | "LR";
  /** 형제 사이 간격(교차 축) */
  nodesep?: number;
  /** 단계 사이 간격(흐름 축) */
  ranksep?: number;
  /** 형제가 이 수를 넘으면 한 줄로 늘리지 않고 격자로 접는다. 0 이면 접지 않음. */
  fanoutWrap?: number;
  /** 이전 좌표. 주면 안정화 수행 — 위 설명 참고. */
  previous?: Map<string, Point> | Record<string, Point>;
}

export interface StableLayoutResult {
  positions: Map<string, Point>;
  /** 배치에서 제외한 "영역을 가로지르는" 간선 */
  crossEdges: LayoutEdgeRef[];
  /** 주 흐름으로 판단해 직선 배치한 노드 */
  spine: string[];
  /** 예전 좌표를 그대로 유지한 노드 */
  pinned: string[];
}

const DEFAULTS = { nodesep: 24, ranksep: 72, fanoutWrap: 6 };

interface AC { a: number; c: number }
interface Block {
  members: string[];
  /** 블록 원점 기준 좌표 */
  local: Map<string, AC>;
  aSize: number;
  cSize: number;
  /** 부모가 연결되는 지점(루트 노드의 교차축 중심) */
  entryC: number;
}

const toMap = (p: StableLayoutOptions["previous"]): Map<string, Point> =>
  p instanceof Map ? p : new Map(Object.entries(p ?? {}));
const toXY = (a: number, c: number, dir: "TB" | "LR"): Point => (dir === "LR" ? { x: a, y: c } : { x: c, y: a });
const fromXY = (p: Point, dir: "TB" | "LR"): AC => (dir === "LR" ? { a: p.x, c: p.y } : { a: p.y, c: p.x });

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 트리 골격. 부모는 "깊이가 가장 큰 선행 노드"를 고른다 — 그래야 사슬이 끊기지 않고 직선으로 이어진다.
 * 부모로 뽑히지 않은 나머지 진입 간선이 cross edge.
 */
export function buildSkeleton(nodes: LayoutNodeSize[], edges: LayoutEdgeRef[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const clean = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const outs = new Map<string, string[]>();
  const ins = new Map<string, string[]>();
  for (const id of ids) { outs.set(id, []); ins.set(id, []); }
  for (const e of clean) { outs.get(e.source)!.push(e.target); ins.get(e.target)!.push(e.source); }

  // 최장 경로 깊이 (Kahn). 순환이 남으면 그 노드들은 깊이 0 으로 두고 아래에서 루트 승격된다.
  const indeg = new Map<string, number>();
  for (const id of ids) indeg.set(id, ins.get(id)!.length);
  const depth = new Map<string, number>();
  for (const id of ids) depth.set(id, 0);
  const q = [...ids].filter((id) => indeg.get(id) === 0);
  const seenTopo = new Set<string>(q);
  while (q.length) {
    const v = q.shift()!;
    for (const w of outs.get(v)!) {
      depth.set(w, Math.max(depth.get(w)!, depth.get(v)! + 1));
      indeg.set(w, indeg.get(w)! - 1);
      if (indeg.get(w) === 0) { q.push(w); seenTopo.add(w); }
    }
  }

  // 각 노드가 "원래 속한 흐름"을 정한다 = 가장 가까운 루트(다중 시작 BFS).
  // 이게 있어야 다른 영역에서 들어오는 간선을 부모로 잘못 뽑지 않는다.
  // 예) [E]→[F]→[G] 와 [A]→…→[C], 그리고 C→G 가 있을 때 G 는 F 의 자식으로 남고 C→G 가 cross 가 된다.
  const rootIds = nodes.map((n) => n.id).filter((id) => ins.get(id)!.length === 0);
  const home = new Map<string, string>();
  const dist = new Map<string, number>();
  const bfs: string[] = [];
  for (const r of rootIds) { home.set(r, r); dist.set(r, 0); bfs.push(r); }
  for (let i = 0; i < bfs.length; i++) {
    const v = bfs[i];
    for (const w of outs.get(v)!) {
      const nd = dist.get(v)! + 1;
      if (!dist.has(w) || nd < dist.get(w)!) { dist.set(w, nd); home.set(w, home.get(v)!); bfs.push(w); }
    }
  }

  const parent = new Map<string, string | null>();
  const crossEdges: LayoutEdgeRef[] = [];
  for (const id of ids) {
    const sources = ins.get(id)!;
    if (!sources.length) { parent.set(id, null); continue; }
    // 같은 흐름에 속한 선행 노드 중에서, 가장 깊은 것을 부모로 (사슬을 끊지 않기 위해).
    // 같은 흐름이 없으면 전체에서 가장 깊은 것.
    const mine = home.get(id);
    const sameFlow = sources.filter((s) => home.get(s) === mine);
    const pool = sameFlow.length ? sameFlow : sources;
    let best = pool[0];
    for (const s of pool) if (depth.get(s)! > depth.get(best)!) best = s;
    parent.set(id, best);
    for (const s of sources) if (s !== best) crossEdges.push({ source: s, target: id });
  }
  // 부모 사슬에 순환이 남으면(원본이 순환) 끊어서 루트로 올린다 — 무한 재귀 방지
  for (const id of ids) {
    const seen = new Set<string>([id]);
    let cur = parent.get(id) ?? null;
    while (cur) {
      if (seen.has(cur)) {
        const p = parent.get(id)!;
        crossEdges.push({ source: p, target: id });
        parent.set(id, null);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }

  const children = new Map<string, string[]>();
  for (const id of ids) children.set(id, []);
  for (const id of ids) { const p = parent.get(id); if (p) children.get(p)!.push(id); }
  const roots = nodes.map((n) => n.id).filter((id) => !parent.get(id));
  return { children, parent, roots, depth, crossEdges };
}

/** 사슬 길이 — 주 흐름(spine)을 고를 때 쓴다. */
function chainDepths(roots: string[], children: Map<string, string[]>): Map<string, number> {
  const memo = new Map<string, number>();
  const walk = (v: string, stack: Set<string>): number => {
    const hit = memo.get(v);
    if (hit !== undefined) return hit;
    if (stack.has(v)) return 1;
    stack.add(v);
    let best = 0;
    for (const c of children.get(v) ?? []) best = Math.max(best, walk(c, stack));
    stack.delete(v);
    const d = best + 1;
    memo.set(v, d);
    return d;
  };
  for (const r of roots) walk(r, new Set());
  return memo;
}

/** 형제 블록을 격자로 접는다. 열은 흐름 축, 행은 교차 축. */
function gridArrange(blocks: Block[], nodesep: number, ranksep: number) {
  const perCol = Math.max(1, Math.ceil(Math.sqrt(blocks.length)));
  const cols = Math.ceil(blocks.length / perCol);
  const colW = new Array<number>(cols).fill(0);
  const rowH = new Array<number>(perCol).fill(0);
  blocks.forEach((b, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    colW[col] = Math.max(colW[col], b.aSize);
    rowH[row] = Math.max(rowH[row], b.cSize);
  });
  const colA: number[] = []; let a = 0;
  for (let i = 0; i < cols; i++) { colA.push(a); a += colW[i] + ranksep; }
  const rowC: number[] = []; let c = 0;
  for (let i = 0; i < perCol; i++) { rowC.push(c); c += rowH[i] + nodesep; }
  const placed = blocks.map((b, i) => ({ block: b, a: colA[Math.floor(i / perCol)], c: rowC[i % perCol] }));
  return { placed, aSize: Math.max(0, a - ranksep), cSize: Math.max(0, c - nodesep) };
}

function buildBlock(
  v: string,
  size: Map<string, AC>,
  children: Map<string, string[]>,
  depths: Map<string, number>,
  opt: { nodesep: number; ranksep: number; fanoutWrap: number },
  spine: Set<string>,
  stack: Set<string>,
): Block {
  const s = size.get(v)!;
  const kids = (children.get(v) ?? []).filter((k) => !stack.has(k));
  if (!kids.length) {
    return { members: [v], local: new Map([[v, { a: 0, c: 0 }]]), aSize: s.a, cSize: s.c, entryC: s.c / 2 };
  }
  stack.add(v);
  // 주 흐름 자식 = 가장 깊은 사슬. 이 자식만 부모와 같은 축에 두어 직선을 유지한다.
  let mainKid = kids[0];
  for (const k of kids) if ((depths.get(k) ?? 0) > (depths.get(mainKid) ?? 0)) mainKid = k;
  if (spine.has(v)) spine.add(mainKid);
  const ordered = [mainKid, ...kids.filter((k) => k !== mainKid)];
  const blocks = ordered.map((k) => buildBlock(k, size, children, depths, opt, spine, stack));
  stack.delete(v);

  const childA = s.a + opt.ranksep;
  const local = new Map<string, AC>();
  let childASize = 0;
  let anchorC: number; // 부모가 정렬될 교차축 지점

  const wrap = opt.fanoutWrap > 0 && blocks.length > opt.fanoutWrap && blocks.every((b) => b.members.length === 1);
  if (wrap) {
    const g = gridArrange(blocks, opt.nodesep, opt.ranksep);
    for (const { block, a, c } of g.placed) {
      for (const m of block.members) {
        const p = block.local.get(m)!;
        local.set(m, { a: childA + a + p.a, c: c + p.c });
      }
    }
    childASize = g.aSize;
    anchorC = g.cSize / 2; // 격자면 가운데 정렬
  } else {
    let cursor = 0;
    anchorC = 0;
    blocks.forEach((b, i) => {
      for (const m of b.members) {
        const p = b.local.get(m)!;
        local.set(m, { a: childA + p.a, c: cursor + p.c });
      }
      if (i === 0) anchorC = cursor + b.entryC; // 주 흐름 자식과 정렬
      childASize = Math.max(childASize, b.aSize);
      cursor += b.cSize + opt.nodesep;
    });
  }

  // 부모 배치 후 원점(0) 보정
  let vC = anchorC - s.c / 2;
  let minC = vC;
  for (const p of local.values()) minC = Math.min(minC, p.c);
  const shift = -minC;
  vC += shift;
  for (const [k, p] of local) local.set(k, { a: p.a, c: p.c + shift });
  local.set(v, { a: 0, c: vC });

  let cSize = 0;
  for (const [m, p] of local) cSize = Math.max(cSize, p.c + size.get(m)!.c);
  return {
    members: [v, ...blocks.flatMap((b) => b.members)],
    local,
    aSize: childA + childASize,
    cSize,
    entryC: vC + s.c / 2,
  };
}

/** 서브트리 구성원 수집 */
function subtreeMembers(v: string, children: Map<string, string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (n: string) => {
    if (seen.has(n)) return;
    seen.add(n); out.push(n);
    for (const c of children.get(n) ?? []) walk(c);
  };
  walk(v);
  return out;
}

export function stableLayout(
  nodes: LayoutNodeSize[],
  edges: LayoutEdgeRef[],
  options: StableLayoutOptions = {},
): StableLayoutResult {
  const dir = options.direction ?? "TB";
  const opt = {
    nodesep: options.nodesep ?? DEFAULTS.nodesep,
    ranksep: options.ranksep ?? DEFAULTS.ranksep,
    fanoutWrap: options.fanoutWrap ?? DEFAULTS.fanoutWrap,
  };
  const positions = new Map<string, Point>();
  if (!nodes.length) return { positions, crossEdges: [], spine: [], pinned: [] };

  const size = new Map(nodes.map((n) => [n.id, fromXY({ x: n.width, y: n.height }, dir)] as const));
  const { children, roots, crossEdges } = buildSkeleton(nodes, edges);
  const depths = chainDepths(roots, children);

  const spine = new Set<string>(roots);
  const fresh = new Map<string, Point>();
  let cursor = 0;
  for (const r of roots) {
    const block = buildBlock(r, size, children, depths, opt, spine, new Set());
    for (const m of block.members) {
      const p = block.local.get(m)!;
      fresh.set(m, toXY(p.a, cursor + p.c, dir));
    }
    cursor += block.cSize + opt.ranksep;
  }
  for (const n of nodes) if (!fresh.has(n.id)) { fresh.set(n.id, toXY(0, cursor, dir)); cursor += size.get(n.id)!.c + opt.nodesep; }

  const prev = toMap(options.previous);
  if (!prev.size) {
    for (const [k, v] of fresh) positions.set(k, { x: Math.round(v.x), y: Math.round(v.y) });
    return { positions, crossEdges, spine: [...spine], pinned: [] };
  }

  // ── 안정화 ────────────────────────────────────────────────────────────────
  // (a) 전체 앵커: 예전에 있던 노드들의 이동량 중앙값만큼 되돌린다. 배치가 통째로 밀리는 것을 막는다.
  const dxs: number[] = [], dys: number[] = [];
  for (const [id, p] of fresh) { const o = prev.get(id); if (o) { dxs.push(o.x - p.x); dys.push(o.y - p.y); } }
  const gdx = median(dxs), gdy = median(dys);

  // (b) 구성원이 전부 예전에 있던 서브트리는 통째로 예전 좌표 유지.
  //     새 노드가 하나라도 섞이면 그 서브트리는 다시 배치된다 → 바뀐 가지만 움직인다.
  const pinned = new Set<string>();
  const visit = (v: string) => {
    const members = subtreeMembers(v, children);
    if (members.every((m) => prev.has(m))) { for (const m of members) pinned.add(m); return; }
    for (const c of children.get(v) ?? []) visit(c);
  };
  for (const r of roots) visit(r);

  const out = new Map<string, Point>();
  for (const n of nodes) {
    const p = pinned.has(n.id) ? prev.get(n.id)! : { x: fresh.get(n.id)!.x + gdx, y: fresh.get(n.id)!.y + gdy };
    out.set(n.id, p);
  }

  // (c) 새로 놓인 노드가 고정된 노드와 겹치면, 움직여도 되는 쪽만 민다.
  resolveOverlaps(nodes, out, pinned, dir, opt.nodesep);
  for (const [k, v] of out) positions.set(k, { x: Math.round(v.x), y: Math.round(v.y) });
  return { positions, crossEdges, spine: [...spine], pinned: [...pinned] };
}

/** 겹침 해소 — 고정된 노드는 두고 나머지만 교차 축으로 민다. */
function resolveOverlaps(
  nodes: LayoutNodeSize[],
  pos: Map<string, Point>,
  pinned: Set<string>,
  dir: "TB" | "LR",
  gap: number,
) {
  const movable = nodes.filter((n) => !pinned.has(n.id));
  if (!movable.length) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const m of movable) {
      for (const other of nodes) {
        if (other.id === m.id) continue;
        const a = pos.get(m.id)!, b = pos.get(other.id)!;
        const an = byId.get(m.id)!, bn = byId.get(other.id)!;
        const hit = a.x < b.x + bn.width && b.x < a.x + an.width && a.y < b.y + bn.height && b.y < a.y + an.height;
        if (!hit) continue;
        if (dir === "LR") pos.set(m.id, { x: a.x, y: b.y + bn.height + gap });
        else pos.set(m.id, { x: b.x + bn.width + gap, y: a.y });
        moved = true;
      }
    }
    if (!moved) return;
  }
}
