/**
 * 기능명세서 AI 생성의 공용 부품 — 스키마·규칙·프롬프트·행 변환.
 *
 * 일반 라우트(한 번에 결과)와 스트리밍 라우트(생기는 대로 밀어줌)가 **같은 프롬프트**를 써야
 * 두 경로의 결과 품질이 갈리지 않는다. 그래서 여기 한 곳에 둔다.
 */
import { z } from "zod";
import { projects, items } from "@/lib/repo";
import { prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { SPEC_SLOTS, SPEC_SLOT_LABEL, rid, type Item, type ItemType } from "@/lib/types";
import type { CreateItemInput } from "@/lib/repo/items";

export const slotsSchema = z.object(Object.fromEntries(SPEC_SLOTS.map((s) => [s, z.string()])) as Record<(typeof SPEC_SLOTS)[number], z.ZodString>);
export const specSchema = z.object({ title: z.string(), description: z.string(), slots: slotsSchema });
export const featureSchema = z.object({
  title: z.string(),
  description: z.string(),
  roles: z.array(z.string()),
  rationale: z.string(),
  successCriteria: z.string(),
  specs: z.array(specSchema),
});
export const requirementSchema = z.object({ title: z.string(), description: z.string(), acceptance: z.array(z.string()), features: z.array(featureSchema) });

export type ProposedSpec = z.infer<typeof specSchema>;
export type ProposedFeature = z.infer<typeof featureSchema>;
export type ProposedRequirement = z.infer<typeof requirementSchema>;

const SLOT_GUIDE = SPEC_SLOTS.map((s) => `${s}(${SPEC_SLOT_LABEL[s]})`).join(", ");
export const RULES = [
  "작성 규칙:",
  "- 모든 텍스트는 한국어. 제목은 명사형으로 짧게(20자 내외), 설명은 1~3문장.",
  "- 요구사항(requirement): 사용자가 얻는 가치 단위. acceptance는 검증 가능한 '수용 기준' 문장 2~4개.",
  "- 기능(feature): 요구사항을 만족시키는 기능 단위. roles는 PRD의 사용자 역할 중 관련 역할, rationale은 왜 필요한지, successCriteria는 측정 가능한 성공 기준.",
  `- 상세기능(spec): 개발자가 바로 구현할 수 있는 최소 단위. slots 9개(${SLOT_GUIDE})를 각각 2문장 이내로 채우되 해당 없으면 빈 문자열.`,
  "- 이미 존재하는 항목과 중복되는 내용은 만들지 않는다. 누락된 정책·예외·권한을 우선 보완한다.",
  "- 요청한 개수를 넘기지 말 것. 부족한 부분은 사용자가 '확장'으로 이어서 채운다.",
  "- 각 객체는 반드시 title 을 첫 번째 키로 쓴다(화면에 제목부터 그리기 위해).",
].join("\n");

// ---------------------------------------------------------------- rows
export const specRow = (s: ProposedSpec, parentId: string | null): Omit<CreateItemInput, "projectId"> => ({
  type: "spec", parentId, title: s.title, description: s.description, status: "proposed", aiProposed: true,
  data: { slots: s.slots, hiddenSlots: [] },
});
export const featureRow = (f: ProposedFeature, parentId: string | null): Omit<CreateItemInput, "projectId"> => ({
  type: "feature", parentId, title: f.title, description: f.description, status: "proposed", aiProposed: true,
  data: { roles: f.roles, rationale: f.rationale, successCriteria: f.successCriteria },
});
export const requirementRow = (r: ProposedRequirement): Omit<CreateItemInput, "projectId"> => ({
  type: "requirement", parentId: null, title: r.title, description: r.description, status: "proposed", aiProposed: true,
  data: { acceptance: r.acceptance.map((text) => ({ id: rid(), text, done: false })) },
});

// ---------------------------------------------------------------- prompt
export type GenMode = "generate" | "extend";
export interface GenPlan {
  mode: GenMode;
  parent: Item | null;
  /** 모델이 돌려줄 루트 배열 키와 그 원소 타입 */
  rootKey: "requirements" | "features" | "specs";
  rootType: ItemType;
  schema: z.ZodTypeAny;
  prompt: string;
  /** policy.ts 의 작업 이름 */
  task: "features.requirements" | "features.features" | "features.specs";
  logLabel: string;
}

/** 어떤 모드로 무엇을 생성할지 결정하고 프롬프트를 조립한다. 잘못된 요청이면 문자열 에러를 돌려준다. */
export function planFeaturesGen(projectId: string, mode: GenMode, parentId: string | null, hint: string): GenPlan | string {
  const p = projects.get(projectId);
  if (!p) return "project not found";
  const all = items.list(projectId);
  const prd = prdToMarkdown(p.prd, p.title);
  const existing = itemsToMarkdown(all, { withSlots: false });
  const s = p.settings;
  const custom = [s.docStyle && `문서 문체: ${s.docStyle}`, s.featureTemplate && `기능 양식: ${s.featureTemplate}`, s.glossary?.length && `용어집:\n${s.glossary.map((g) => `- ${g.term}: ${g.meaning}`).join("\n")}`].filter(Boolean).join("\n");
  const base = [
    p.description ? `프로젝트 설명/아이디어: ${p.description}` : "",
    `PRD:\n${prd}`,
    existing ? `현재 기능명세서:\n${existing}` : "현재 기능명세서: (비어 있음)",
    custom ? `프로젝트 작성 규칙:\n${custom}` : "",
    hint ? `사용자 추가 요청: ${hint}` : "",
    RULES,
  ].filter(Boolean);

  if (mode === "extend" && parentId) {
    const parent = all.find((x) => x.id === parentId);
    if (!parent || parent.projectId !== projectId) return "parent not found";
    if (parent.type === "spec") return "상세기능은 하위 항목을 가질 수 없습니다";
    const siblings = all.filter((x) => x.parentId === parentId).map((x) => `- ${x.title}`).join("\n");
    if (parent.type === "requirement") {
      const prompt = [
        ...base,
        `지시: 요구사항 "${parent.title}"(${parent.description || "설명 없음"})을 만족시키기 위한 기능(feature)을 2~4개만 생성하고, 각 기능마다 상세기능(spec)을 2~3개만 작성하세요.`,
        siblings ? `이미 있는 하위 기능(중복 금지):\n${siblings}` : "",
      ].filter(Boolean).join("\n\n");
      return { mode, parent, rootKey: "features", rootType: "feature", schema: z.object({ features: z.array(featureSchema) }), prompt, task: "features.features", logLabel: parent.title };
    }
    const reqParent = parent.parentId ? all.find((x) => x.id === parent.parentId) : null;
    const prompt = [
      ...base,
      `지시: ${reqParent ? `요구사항 "${reqParent.title}" 아래 ` : ""}기능 "${parent.title}"(${parent.description || "설명 없음"})을 구현하기 위한 상세기능(spec)을 2~3개만 생성하세요. 정상 흐름 외에 예외·권한·데이터 정책 중 아직 없는 것을 우선 보완하세요.`,
      siblings ? `이미 있는 상세기능(중복 금지):\n${siblings}` : "",
    ].filter(Boolean).join("\n\n");
    return { mode, parent, rootKey: "specs", rootType: "spec", schema: z.object({ specs: z.array(specSchema) }), prompt, task: "features.specs", logLabel: parent.title };
  }

  const empty = all.length === 0;
  const prompt = [
    ...base,
    empty
      ? "지시: PRD를 바탕으로 기능명세서의 뼈대를 생성하세요. 요구사항 3~6개, 각 요구사항마다 기능 2~4개, 각 기능마다 상세기능 2~3개. 이 개수를 초과하지 마세요."
      : "지시: 현재 기능명세서에 빠져 있는 요구사항을 3~4개만 추가 생성하세요(기존 요구사항과 중복 금지). 각 요구사항마다 기능 2~4개, 각 기능마다 상세기능 2~3개. 이 개수를 초과하지 마세요.",
  ].join("\n\n");
  return { mode: "generate", parent: null, rootKey: "requirements", rootType: "requirement", schema: z.object({ requirements: z.array(requirementSchema) }), prompt, task: "features.requirements", logLabel: empty ? "기능명세서 생성" : "요구사항 추가 생성" };
}
