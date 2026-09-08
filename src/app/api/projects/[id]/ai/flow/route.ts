import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, activity } from "@/lib/repo";
import { flowReadiness } from "@/lib/flow/readiness";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import { layoutFlow } from "@/lib/flow/layout";
import { FRAME_COLOR_CYCLE, layoutFramedFlow } from "@/lib/flow/frames";
import { FLOW_NODE_TYPES, rid, type FlowEdge, type FlowFrame, type FlowNode } from "@/lib/types";

/** GET → { ready, hasPrd, hasFeature } */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  return ok(flowReadiness(p));
});

const schema = z.object({
  name: z.string(),
  /** 상황·시나리오 단위의 가로 레인. 앞에서 뒤로 여정 순서. */
  frames: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
  })).optional(),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(FLOW_NODE_TYPES),
    label: z.string(),
    description: z.string(),
    /** 이 노드가 속한 frames[].id */
    frameId: z.string().optional(),
  })),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })),
});

/**
 * POST { mode: "new" | "revise", request?, flowId?, name? } → Flow (created & stored)
 *  new    → PRD/기능명세서 기반으로 새 유저플로우 생성
 *  revise → 기존 flow(flowId)를 바탕으로 개선본을 "<name> (수정본)"으로 생성
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { mode?: "new" | "revise"; request?: string; flowId?: string; name?: string };
  const mode = body.mode ?? "new";
  const ready = flowReadiness(p);
  if (!ready.ready) return bad(!ready.hasPrd ? "PRD 개요의 '한 줄 정의'를 먼저 작성하세요." : "기능명세서에 기능을 1개 이상 추가하세요.", 409);

  const base = mode === "revise" && body.flowId ? flows.get(body.flowId) : undefined;
  if (mode === "revise" && (!base || base.projectId !== id)) return bad("flowId required for revise");
  const { text } = projectContext(id, { includePages: true, includeFlows: false });
  const request = (body.request ?? base?.request ?? "").trim();

  const guide = [
    "프레임(frames): 전체 여정을 상황/시나리오 단위로 3~7개의 프레임으로 나누세요. 각 프레임은 가로 레인 하나로 그려집니다. id는 f1, f2 … 처럼 짧게, label은 한국어 2~5단어의 상황 이름(예: 가입·인증, 모임 탐색, 가입 신청, 정기모임 참석, 결제·정산), description은 1문장.",
    "프레임은 여정 순서대로 나열하고, 각 프레임은 앞 프레임이 끝난 지점에서 이어받아 시작합니다. 프레임 사이를 잇는 edge(레인을 넘나드는 연결)를 반드시 두세요.",
    "모든 노드에는 자신이 속한 frames[].id 를 frameId 로 지정하세요. 첫 프레임 안에 start 노드가 정확히 1개 있어야 합니다.",
    "노드 타입: start(시작, 정확히 1개, 진입점) / page(사용자가 보는 화면) / action(사용자 행동 또는 시스템 처리) / branch(조건 분기, 질문형 라벨) / data(저장·조회되는 데이터, 서버 처리 결과)",
    "규칙: id는 n1, n2 … 처럼 짧고 고유하게. label은 한국어 2~6단어. description은 1문장. edge는 흐름 순서대로 연결하고, branch에서 나가는 edge는 반드시 label(예: 예/아니오, 성공/실패, 조건)을 붙이세요. 일반 edge는 label 생략 가능.",
    "시작 노드에서 모든 노드로 도달 가능해야 하며, 끊긴 노드가 없어야 합니다. 노드 8~24개(프레임마다 2~6개), 핵심 여정 중심. 정보구조도의 페이지 이름이 있으면 page 노드 라벨로 재사용하세요.",
  ].join("\n");

  const prompt = [
    text,
    base ? `기존 유저플로우 "${base.name}" (원 요청: ${base.request || "없음"}):\n${base.frames.length ? `프레임:\n${[...base.frames].sort((a, b) => a.order - b.order).map((f) => `- ${f.id} ${f.label}${f.description ? `: ${f.description}` : ""}`).join("\n")}\n` : ""}노드:\n${base.nodes.map((n) => `- ${n.id} [${n.type}]${n.frameId ? ` (${n.frameId})` : ""} ${n.label}${n.description ? `: ${n.description}` : ""}`).join("\n")}\n연결:\n${base.edges.map((e) => `- ${e.source} → ${e.target}${e.label ? ` (${e.label})` : ""}`).join("\n")}` : "",
    request ? `사용자 요청 사항: ${request}` : "",
    base
      ? `지시: 위 기존 유저플로우의 개선본을 만드세요. 빠진 예외/분기/데이터 처리를 보강하고, 불필요한 단계는 정리하며, 사용자 요청을 반영합니다. name은 기존 이름을 유지하세요(접미사는 서버가 붙임).${base.frames.length ? " 기존 프레임의 id와 label은 그대로 유지하고(순서도 유지), 필요하면 프레임을 추가만 하세요." : ""}`
      : "지시: 이 제품의 핵심 사용자 여정을 유저플로우로 만드세요. name은 이 플로우를 한 문장으로 요약한 짧은 제목(예: 회원가입 및 첫 주문 흐름).",
    guide,
  ].filter(Boolean).join("\n\n");

  const r = await generateJson({ task: "flow.generate", system: MANNY_SYSTEM, prompt, schema });
  const { nodes, edges, frames } = normalize(r.data.nodes, r.data.edges, r.data.frames ?? []);
  const name = mode === "revise" ? `${(base!.name).replace(/\s*\(수정본( \d+)?\)$/, "")} (수정본)` : (body.name?.trim() || r.data.name || "새 유저플로우");
  const f = flows.create({ projectId: id, name, request, nodes, edges, frames });
  activity.log(id, "flow.create", f.name, { mode, nodeCount: nodes.length, frameCount: frames.length }, "manny");
  activity.log(id, "ai.flow", f.name, { mode, usage: r.usage }, "manny");
  return ok(f, { status: 201 });
});

/** Ensure exactly one start, unique ids, valid edges, branch labels, frames, and dagre positions. */
function normalize(
  rawNodes: z.infer<typeof schema>["nodes"],
  rawEdges: z.infer<typeof schema>["edges"],
  rawFrames: NonNullable<z.infer<typeof schema>["frames"]>,
): { nodes: FlowNode[]; edges: FlowEdge[]; frames: FlowFrame[] } {
  // 프레임: 중복 id 제거 + 순서/색 부여
  const fseen = new Set<string>();
  const frames: FlowFrame[] = [];
  for (const f of rawFrames) {
    const fid = f.id?.trim();
    if (!fid || fseen.has(fid)) continue;
    fseen.add(fid);
    frames.push({
      id: fid, label: f.label?.trim() || `상황 ${frames.length + 1}`, description: f.description?.trim() ?? "",
      color: FRAME_COLOR_CYCLE[frames.length % FRAME_COLOR_CYCLE.length], order: frames.length,
    });
  }
  const firstFrame = frames[0]?.id;

  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const n of rawNodes) {
    let nid = n.id.trim() || rid();
    while (seen.has(nid)) nid = `${nid}_${rid().slice(0, 3)}`;
    seen.add(nid);
    // 모르는 frameId 는 첫 프레임으로 (레인 밖으로 새는 노드 방지)
    const frameId = firstFrame ? (n.frameId && fseen.has(n.frameId) ? n.frameId : firstFrame) : undefined;
    nodes.push({ id: nid, type: n.type, label: n.label.trim() || "(제목 없음)", description: n.description?.trim() ?? "", position: { x: 0, y: 0 }, ...(frameId ? { frameId } : {}) });
  }
  // exactly one start, 첫 프레임 안에
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length === 0) {
    const s: FlowNode = { id: "start", type: "start", label: "시작", description: "", position: { x: 0, y: 0 }, ...(firstFrame ? { frameId: firstFrame } : {}) };
    nodes.unshift(s);
    if (nodes[1]) rawEdges = [{ source: "start", target: nodes[1].id }, ...rawEdges];
  } else {
    if (firstFrame) starts[0].frameId = firstFrame;
    for (const extra of starts.slice(1)) extra.type = "action";
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: FlowEdge[] = [];
  const dup = new Set<string>();
  for (const e of rawEdges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    const key = `${e.source}->${e.target}`;
    if (dup.has(key)) continue;
    dup.add(key);
    edges.push({ id: `e_${e.source}_${e.target}`, source: e.source, target: e.target, ...(e.label?.trim() ? { label: e.label.trim() } : {}) });
  }
  // branch edges must be labeled
  for (const n of nodes) {
    if (n.type !== "branch") continue;
    const outs = edges.filter((e) => e.source === n.id);
    outs.forEach((e, i) => { if (!e.label) e.label = outs.length === 2 ? (i === 0 ? "예" : "아니오") : `조건 ${i + 1}`; });
  }
  if (!frames.length) {
    const pos = layoutFlow(nodes, edges);
    for (const n of nodes) n.position = pos.get(n.id) ?? { x: 0, y: 0 };
    return { nodes, edges, frames };
  }
  // 레인별 dagre LR → 레인을 세로로 적층. frames 에는 캔버스 기하(x/y/w/h)가 함께 실린다.
  const laid = layoutFramedFlow(nodes, edges, frames);
  for (const n of nodes) n.position = laid.positions.get(n.id) ?? { x: 0, y: 0 };
  return { nodes, edges, frames: laid.frames };
}
