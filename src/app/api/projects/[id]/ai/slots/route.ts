import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, prdToMarkdown } from "@/lib/ai/context";
import { SPEC_SLOTS, SPEC_SLOT_LABEL, type FeatureData, type Item, type SpecData, type SpecSlot } from "@/lib/types";

const slotsSchema = z.object(Object.fromEntries(SPEC_SLOTS.map((s) => [s, z.string()])) as Record<SpecSlot, z.ZodString>);

const SLOT_HINT: Record<SpecSlot, string> = {
  precondition: "이 기능이 동작하기 위해 미리 충족되어야 하는 상태/조건",
  trigger: "기능이 시작되는 사용자 행동 또는 시스템 이벤트",
  action: "시스템이 수행하는 처리 단계(순서대로)",
  result: "정상 완료 시 사용자가 얻는 결과와 상태 변화",
  exception: "실패/오류/경계 상황과 그때의 처리·안내 문구",
  display: "화면에 표시되는 요소, 문구, 상태 표현",
  permission: "누가 접근·실행할 수 있는지, 역할별 제한",
  business_rule: "정책·제약·계산 규칙(수치 포함)",
  data: "입력/저장/변경되는 데이터 항목과 형식",
};

/** 대상 검증 + 프롬프트 조립. 일반/스트리밍 라우트가 같이 쓴다. 문제가 있으면 { error, status }. */
type PlanError = { error: string; status: 400 | 404 };
export function planSlots(projectId: string, itemId: string | undefined, hint: string): PlanError | { spec: Item; prompt: string } {
  const p = projects.get(projectId);
  if (!p) return { error: "project not found", status: 404 };
  if (!itemId) return { error: "itemId required", status: 400 };
  const spec = items.get(itemId);
  if (!spec || spec.projectId !== projectId) return { error: "item not found", status: 404 };
  if (spec.type !== "spec") return { error: "상세기능 항목만 슬롯을 작성할 수 있습니다", status: 400 };
  const feature = spec.parentId ? items.get(spec.parentId) : undefined;
  const requirement = feature?.parentId ? items.get(feature.parentId) : undefined;
  const fd = feature?.data as FeatureData | undefined;
  const sd = spec.data as SpecData;
  const siblings = feature ? items.list(projectId).filter((x) => x.parentId === feature.id && x.id !== spec.id).map((x) => `- ${x.title}`).join("\n") : "";
  const prompt = [
    `PRD:\n${prdToMarkdown(p.prd, p.title)}`,
    requirement ? `요구사항: ${requirement.title}\n${requirement.description}` : "",
    feature ? `기능: ${feature.title}\n${feature.description}${fd?.roles?.length ? `\n사용자 역할: ${fd.roles.join(", ")}` : ""}${fd?.rationale ? `\n근거: ${fd.rationale}` : ""}` : "",
    siblings ? `같은 기능의 다른 상세기능:\n${siblings}` : "",
    `대상 상세기능: ${spec.title}\n${spec.description || "(설명 없음)"}`,
    `현재 슬롯 값:\n${SPEC_SLOTS.map((s) => `- ${SPEC_SLOT_LABEL[s]}: ${sd.slots?.[s]?.trim() || "(비어 있음)"}`).join("\n")}`,
    hint ? `사용자 추가 요청: ${hint}` : "",
    `지시: 위 상세기능의 "개발 준비 슬롯" 9개를 개발자가 바로 구현할 수 있을 만큼 구체적으로 한국어로 작성하세요. 비어 있는 슬롯은 채우고, 이미 있는 슬롯은 더 명확하게 보완하세요. 각 슬롯은 1~4문장 또는 불릿(- ) 목록. 해당 사항이 없으면 "해당 없음"이라고 적으세요. 슬롯은 아래 순서대로 쓰세요.\n슬롯 설명:\n${SPEC_SLOTS.map((s) => `- ${s}(${SPEC_SLOT_LABEL[s]}): ${SLOT_HINT[s]}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return { spec, prompt };
}
export const slotsOutSchema = z.object({ slots: slotsSchema });

/** POST { itemId: string, hint?: string } → { slots: Record<SpecSlot,string> }  (한 번에 — MCP·스크립트용) */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { itemId, hint = "" } = (await req.json().catch(() => ({}))) as { itemId?: string; hint?: string };
  const plan = planSlots(id, itemId, hint);
  if ("error" in plan) return plan.status === 404 ? notFound(plan.error) : bad(plan.error);
  const r = await generateJson({ task: "features.slots", system: MANNY_SYSTEM, prompt: plan.prompt, schema: slotsOutSchema });
  activity.log(id, "ai.slots", plan.spec.title, { itemId }, "manny");
  return ok({ slots: r.data.slots, usage: r.usage });
});
