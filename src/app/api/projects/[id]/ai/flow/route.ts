import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, flows, activity } from "@/lib/repo";
import { flowReadiness } from "@/lib/flow/readiness";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import { layoutFlow } from "@/lib/flow/layout";
import { FLOW_NODE_TYPES, rid, type FlowEdge, type FlowNode } from "@/lib/types";

/** GET → { ready, hasPrd, hasFeature } */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  return ok(flowReadiness(p));
});

const schema = z.object({
  name: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(FLOW_NODE_TYPES),
    label: z.string(),
    description: z.string(),
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
    "노드 타입: start(시작, 정확히 1개, 진입점) / page(사용자가 보는 화면) / action(사용자 행동 또는 시스템 처리) / branch(조건 분기, 질문형 라벨) / data(저장·조회되는 데이터, 서버 처리 결과)",
    "규칙: id는 n1, n2 … 처럼 짧고 고유하게. label은 한국어 2~6단어. description은 1문장. edge는 흐름 순서대로 연결하고, branch에서 나가는 edge는 반드시 label(예: 예/아니오, 성공/실패, 조건)을 붙이세요. 일반 edge는 label 생략 가능.",
    "시작 노드에서 모든 노드로 도달 가능해야 하며, 끊긴 노드가 없어야 합니다. 노드 8~20개, 핵심 여정 중심. 정보구조도의 페이지 이름이 있으면 page 노드 라벨로 재사용하세요.",
  ].join("\n");

  const prompt = [
    text,
    base ? `기존 유저플로우 "${base.name}" (원 요청: ${base.request || "없음"}):\n노드:\n${base.nodes.map((n) => `- ${n.id} [${n.type}] ${n.label}${n.description ? `: ${n.description}` : ""}`).join("\n")}\n연결:\n${base.edges.map((e) => `- ${e.source} → ${e.target}${e.label ? ` (${e.label})` : ""}`).join("\n")}` : "",
    request ? `사용자 요청 사항: ${request}` : "",
    base
      ? "지시: 위 기존 유저플로우의 개선본을 만드세요. 빠진 예외/분기/데이터 처리를 보강하고, 불필요한 단계는 정리하며, 사용자 요청을 반영합니다. name은 기존 이름을 유지하세요(접미사는 서버가 붙임)."
      : "지시: 이 제품의 핵심 사용자 여정을 유저플로우로 만드세요. name은 이 플로우를 한 문장으로 요약한 짧은 제목(예: 회원가입 및 첫 주문 흐름).",
    guide,
  ].filter(Boolean).join("\n\n");

  const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema });
  const { nodes, edges } = normalize(r.data.nodes, r.data.edges);
  const name = mode === "revise" ? `${(base!.name).replace(/\s*\(수정본( \d+)?\)$/, "")} (수정본)` : (body.name?.trim() || r.data.name || "새 유저플로우");
  const f = flows.create({ projectId: id, name, request, nodes, edges });
  activity.log(id, "flow.create", f.name, { mode, nodeCount: nodes.length }, "manny");
  activity.log(id, "ai.flow", f.name, { mode, usage: r.usage }, "manny");
  return ok(f, { status: 201 });
});

/** Ensure exactly one start, unique ids, valid edges, branch labels, and dagre positions. */
function normalize(rawNodes: z.infer<typeof schema>["nodes"], rawEdges: z.infer<typeof schema>["edges"]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const n of rawNodes) {
    let nid = n.id.trim() || rid();
    while (seen.has(nid)) nid = `${nid}_${rid().slice(0, 3)}`;
    seen.add(nid);
    nodes.push({ id: nid, type: n.type, label: n.label.trim() || "(제목 없음)", description: n.description?.trim() ?? "", position: { x: 0, y: 0 } });
  }
  // exactly one start
  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length === 0) {
    const s: FlowNode = { id: "start", type: "start", label: "시작", description: "", position: { x: 0, y: 0 } };
    nodes.unshift(s);
    if (nodes[1]) rawEdges = [{ source: "start", target: nodes[1].id }, ...rawEdges];
  } else if (starts.length > 1) {
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
  const pos = layoutFlow(nodes, edges);
  for (const n of nodes) n.position = pos.get(n.id) ?? { x: 0, y: 0 };
  return { nodes, edges };
}
