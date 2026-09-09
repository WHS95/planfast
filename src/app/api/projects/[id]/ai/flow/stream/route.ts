import { handler, bad, notFound, type Params } from "@/lib/http";
import { flows, activity } from "@/lib/repo";
import { generateStream, toJsonSchema, jsonOnlyInstruction, JSON_SYSTEM_SUFFIX } from "@/lib/ai";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { JsonStreamParser, JsonAssembler } from "@/lib/ai/jsonStream";
import { sse } from "@/lib/sse";
import { flowSchema, planFlowGen, normalizeFlow, type RawFlowNodes, type RawFlowEdges, type RawFlowFrames } from "@/lib/ai/flowGen";

/**
 * POST { mode, request?, flowId?, name? } → SSE
 *
 * 유저플로우를 스트리밍으로 만든다. 플로우 행을 **먼저** 만들어 화면이 바로 열리게 하고,
 * 프레임·노드·엣지가 모델에서 나오는 대로 배치해 저장·전송한다. 캔버스는 저장될 때마다 다시 시드되므로
 * 노드가 하나씩 생겨난다. 배치는 매번 `normalizeFlow` 로 잡는데, 프레임(레인) 단위라 새 노드는 자기
 * 레인 안에서만 움직인다.
 *
 * 이벤트
 *   flow  { flow }  — 빈 플로우 생성 직후, 그리고 노드/엣지/프레임이 추가될 때마다(전체 스냅샷)
 *   done  { flow }  — 최종 정규화(시작 노드·분기 라벨·최종 배치) 후
 *   error { message }
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { mode?: "new" | "revise"; request?: string; flowId?: string; name?: string };
  const plan = planFlowGen(id, body);
  if ("error" in plan) return plan.status === 404 ? notFound() : bad(plan.error, plan.status);

  return sse(async (send) => {
    // 1) 빈 플로우부터 — 사용자가 즉시 캔버스로 이동해 채워지는 것을 본다
    const f0 = flows.create({ projectId: id, name: plan.nameFrom(), request: plan.request, nodes: [], edges: [], frames: [] });
    send("flow", { flow: f0 });

    const parser = new JsonStreamParser();
    const asm = new JsonAssembler();
    const rawFrames: RawFlowFrames = [];
    const rawNodes: RawFlowNodes = [];
    const rawEdges: RawFlowEdges = [];
    let generatedName: string | undefined;
    let lastPersist = 0;

    /** 지금까지 모인 조각으로 정규화·배치해 저장하고 밀어준다. 너무 잦으면 200ms 로 묶는다. */
    const persist = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPersist < 200) return;
      lastPersist = now;
      const { nodes, edges, frames } = normalizeFlow(rawNodes, rawEdges, rawFrames);
      const f = flows.update(f0.id, { nodes, edges, frames, ...(generatedName ? { name: plan.nameFrom(generatedName) } : {}) });
      if (f) send("flow", { flow: f });
    };

    await generateStream({
      task: "flow.generate",
      system: `${MANNY_SYSTEM}\n\n${JSON_SYSTEM_SUFFIX}`,
      prompt: `${plan.prompt}\n\n${jsonOnlyInstruction(toJsonSchema(flowSchema))}`,
      onText: (delta) => {
        for (const ev of parser.feed(delta)) {
          asm.apply(ev);
          if (ev.type === "value" && ev.path.length === 1 && ev.path[0] === "name" && typeof ev.value === "string") {
            generatedName = ev.value.trim();
            continue;
          }
          if (ev.type !== "close" || ev.kind !== "object" || ev.path.length !== 2 || typeof ev.path[1] !== "number") continue;
          const key = ev.path[0];
          const raw = asm.get(ev.path);
          if (key === "frames") { const r = flowSchema.shape.frames.unwrap().element.safeParse(raw); if (r.success) rawFrames.push(r.data); }
          else if (key === "nodes") { const r = flowSchema.shape.nodes.element.safeParse(raw); if (r.success) rawNodes.push(r.data); }
          else if (key === "edges") { const r = flowSchema.shape.edges.element.safeParse(raw); if (r.success) rawEdges.push(r.data); }
          else continue;
          // 노드는 하나씩 보이는 게 핵심이라 즉시, 엣지·프레임은 묶어서
          persist(key === "nodes");
        }
      },
    });

    persist(true);
    const final = flows.get(f0.id)!;
    activity.log(id, "flow.create", final.name, { mode: plan.mode, nodeCount: final.nodes.length, frameCount: final.frames.length, streamed: true }, "manny");
    send("done", { flow: final });
  });
});
