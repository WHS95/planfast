import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { SPEC_SLOTS, SPEC_SLOT_LABEL, rid, type Item, type ItemType } from "@/lib/types";
import type { CreateItemInput } from "@/lib/repo/items";

/** Shapes the model returns (nested tree). They are persisted immediately as aiProposed items. */
const slotsSchema = z.object(Object.fromEntries(SPEC_SLOTS.map((s) => [s, z.string()])) as Record<(typeof SPEC_SLOTS)[number], z.ZodString>);
const specSchema = z.object({ title: z.string(), description: z.string(), slots: slotsSchema });
const featureSchema = z.object({
  title: z.string(),
  description: z.string(),
  roles: z.array(z.string()),
  rationale: z.string(),
  successCriteria: z.string(),
  specs: z.array(specSchema),
});
const requirementSchema = z.object({ title: z.string(), description: z.string(), acceptance: z.array(z.string()), features: z.array(featureSchema) });

export type ProposedSpec = z.infer<typeof specSchema>;
export type ProposedFeature = z.infer<typeof featureSchema>;
export type ProposedRequirement = z.infer<typeof requirementSchema>;

/** Result of an in-place generation: the rows are already in the DB with `aiProposed: true`. */
export interface FeaturesGenerateResult {
  mode: "generate" | "extend";
  parentId: string | null;
  parentType: ItemType | null;
  created: Item[];
  usage?: { input: number; output: number; costUsd?: number };
}

const SLOT_GUIDE = SPEC_SLOTS.map((s) => `${s}(${SPEC_SLOT_LABEL[s]})`).join(", ");
const RULES = [
  "작성 규칙:",
  "- 모든 텍스트는 한국어. 제목은 명사형으로 짧게(20자 내외), 설명은 1~3문장.",
  "- 요구사항(requirement): 사용자가 얻는 가치 단위. acceptance는 검증 가능한 '수용 기준' 문장 2~4개.",
  "- 기능(feature): 요구사항을 만족시키는 기능 단위. roles는 PRD의 사용자 역할 중 관련 역할, rationale은 왜 필요한지, successCriteria는 측정 가능한 성공 기준.",
  `- 상세기능(spec): 개발자가 바로 구현할 수 있는 최소 단위. slots 9개(${SLOT_GUIDE})를 각각 2문장 이내로 채우되 해당 없으면 빈 문자열.`,
  "- 이미 존재하는 항목과 중복되는 내용은 만들지 않는다. 누락된 정책·예외·권한을 우선 보완한다.",
  "- 요청한 개수를 넘기지 말 것. 부족한 부분은 사용자가 '확장'으로 이어서 채운다.",
].join("\n");

// ---------------------------------------------------------------- persistence
const specRow = (s: ProposedSpec, parentId: string | null): Omit<CreateItemInput, "projectId"> => ({
  type: "spec", parentId, title: s.title, description: s.description, status: "proposed", aiProposed: true,
  data: { slots: s.slots, hiddenSlots: [] },
});
const featureRow = (f: ProposedFeature, parentId: string | null): Omit<CreateItemInput, "projectId"> => ({
  type: "feature", parentId, title: f.title, description: f.description, status: "proposed", aiProposed: true,
  data: { roles: f.roles, rationale: f.rationale, successCriteria: f.successCriteria },
});
const requirementRow = (r: ProposedRequirement): Omit<CreateItemInput, "projectId"> => ({
  type: "requirement", parentId: null, title: r.title, description: r.description, status: "proposed", aiProposed: true,
  data: { acceptance: r.acceptance.map((text) => ({ id: rid(), text, done: false })) },
});

/** insert specs under one feature */
function persistSpecs(projectId: string, parentId: string, specs: ProposedSpec[]): Item[] {
  return specs.length ? items.bulkInsert(projectId, specs.map((s) => specRow(s, parentId))) : [];
}
/** insert features (+ their specs) under one requirement */
function persistFeatures(projectId: string, parentId: string, feats: ProposedFeature[]): Item[] {
  if (!feats.length) return [];
  const rows = items.bulkInsert(projectId, feats.map((f) => featureRow(f, parentId)));
  const out: Item[] = [...rows];
  rows.forEach((row, i) => out.push(...persistSpecs(projectId, row.id, feats[i].specs ?? [])));
  return out;
}
/** insert whole requirement subtrees */
function persistRequirements(projectId: string, reqs: ProposedRequirement[]): Item[] {
  if (!reqs.length) return [];
  const rows = items.bulkInsert(projectId, reqs.map(requirementRow));
  const out: Item[] = [...rows];
  rows.forEach((row, i) => out.push(...persistFeatures(projectId, row.id, reqs[i].features ?? [])));
  return out;
}

/**
 * POST { mode: "generate"|"extend", parentId?: string, hint?: string }
 *  - generate: PRD 기반 요구사항 트리 생성(기존 항목이 있으면 보완/추가)
 *  - extend + parentId: 해당 항목의 하위 항목만 생성
 * 생성 결과는 곧바로 aiProposed=true / status="proposed" 로 저장된다 → FeaturesGenerateResult
 * (한 번의 호출이 길어지지 않도록 요청 개수를 작게 유지하고, 부족하면 사용자가 노드별 '확장'을 반복한다)
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const { mode = "generate", parentId = null, hint = "" } = (await req.json().catch(() => ({}))) as { mode?: "generate" | "extend"; parentId?: string | null; hint?: string };
  const all = items.list(id);
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
    if (!parent || parent.projectId !== id) return notFound("parent not found");
    if (parent.type === "spec") return bad("상세기능은 하위 항목을 가질 수 없습니다");
    const siblings = all.filter((x) => x.parentId === parentId).map((x) => `- ${x.title}`).join("\n");

    if (parent.type === "requirement") {
      const prompt = [
        ...base,
        `지시: 요구사항 "${parent.title}"(${parent.description || "설명 없음"})을 만족시키기 위한 기능(feature)을 2~4개만 생성하고, 각 기능마다 상세기능(spec)을 2~3개만 작성하세요.`,
        siblings ? `이미 있는 하위 기능(중복 금지):\n${siblings}` : "",
      ].filter(Boolean).join("\n\n");
      const r = await generateJson({ task: "features.features", system: MANNY_SYSTEM, prompt, schema: z.object({ features: z.array(featureSchema) }) });
      const created = persistFeatures(id, parent.id, r.data.features);
      activity.log(id, "ai.features", parent.title, { mode, parentId, count: created.length, aiProposed: true }, "manny");
      return ok({ mode, parentId, parentType: parent.type, created, usage: r.usage } satisfies FeaturesGenerateResult);
    }

    const reqParent = parent.parentId ? all.find((x) => x.id === parent.parentId) : null;
    const prompt = [
      ...base,
      `지시: ${reqParent ? `요구사항 "${reqParent.title}" 아래 ` : ""}기능 "${parent.title}"(${parent.description || "설명 없음"})을 구현하기 위한 상세기능(spec)을 2~3개만 생성하세요. 정상 흐름 외에 예외·권한·데이터 정책 중 아직 없는 것을 우선 보완하세요.`,
      siblings ? `이미 있는 상세기능(중복 금지):\n${siblings}` : "",
    ].filter(Boolean).join("\n\n");
    const r = await generateJson({ task: "features.specs", system: MANNY_SYSTEM, prompt, schema: z.object({ specs: z.array(specSchema) }) });
    const created = persistSpecs(id, parent.id, r.data.specs);
    activity.log(id, "ai.features", parent.title, { mode, parentId, count: created.length, aiProposed: true }, "manny");
    return ok({ mode, parentId, parentType: parent.type, created, usage: r.usage } satisfies FeaturesGenerateResult);
  }

  const empty = all.length === 0;
  const prompt = [
    ...base,
    empty
      ? "지시: PRD를 바탕으로 기능명세서의 뼈대를 생성하세요. 요구사항 3~6개, 각 요구사항마다 기능 2~4개, 각 기능마다 상세기능 2~3개. 이 개수를 초과하지 마세요."
      : "지시: 현재 기능명세서에 빠져 있는 요구사항을 3~4개만 추가 생성하세요(기존 요구사항과 중복 금지). 각 요구사항마다 기능 2~4개, 각 기능마다 상세기능 2~3개. 이 개수를 초과하지 마세요.",
  ].join("\n\n");
  const r = await generateJson({ task: "features.requirements", system: MANNY_SYSTEM, prompt, schema: z.object({ requirements: z.array(requirementSchema) }) });
  const created = persistRequirements(id, r.data.requirements);
  activity.log(id, "ai.features", empty ? "기능명세서 생성" : "요구사항 추가 생성", { mode, count: created.length, aiProposed: true }, "manny");
  return ok({ mode: "generate", parentId: null, parentType: null, created, usage: r.usage } satisfies FeaturesGenerateResult);
});
