import { z } from "zod";
import { handler, ok, notFound, type Params } from "@/lib/http";
import { projects, items, attachments, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";

/** 대상 필드·프롬프트 조립. 일반/스트리밍 라우트가 같이 쓴다. */
export function planPrdDraft(projectId: string, sectionId: string | null | undefined, seed: string | undefined) {
  const p = projects.get(projectId);
  if (!p) return null;
  const sections = sectionId ? p.prd.sections.filter((s) => s.id === sectionId) : p.prd.sections;
  const targets = sections.flatMap((s) => s.fields.map((f) => ({ id: f.id, section: s.title, label: f.label, current: f.values ? f.values.join(", ") : f.content, chips: !!f.values })));
  const atts = attachments.list(projectId).map((a) => `--- ${a.name} ---\n${a.text.slice(0, 20000)}`).join("\n\n");
  const feats = itemsToMarkdown(items.list(projectId));
  const prompt = [
    `프로젝트 제목: ${p.title}`,
    p.description ? `프로젝트 설명/아이디어: ${p.description}` : "",
    seed ? `추가 입력: ${seed}` : "",
    atts ? `첨부 자료:\n${atts}` : "",
    "현재 PRD:\n" + prdToMarkdown(p.prd),
    feats ? "현재 기능명세서:\n" + feats : "",
    "작성할 항목 목록 (id / 섹션 / 항목명 / 현재 값):",
    ...targets.map((t) => `- ${t.id} / ${t.section} / ${t.label} / ${t.current || "(비어 있음)"}${t.chips ? " [쉼표로 구분된 짧은 키워드 목록으로 작성]" : ""}`),
    "",
    "지시: 각 항목에 대해 구체적이고 실무적인 내용을 한국어로 작성하세요. 비어 있는 항목은 채우고, 이미 있는 항목은 더 명확하고 논리적으로 보완하세요. 한 줄 정의는 한 문장, 나머지는 2~5문장 또는 불릿(- )로. 모든 id를 빠짐없이 포함하세요. 위 목록 순서대로 쓰고, 각 객체는 id 를 먼저 쓰세요.",
  ].filter(Boolean).join("\n\n");
  return { p, sections, targets, prompt };
}
export const prdFieldSchema = z.object({ id: z.string(), content: z.string() });
export const prdSchema = z.object({ fields: z.array(prdFieldSchema) });

/** POST { sectionId: string|null, seed?: string } → { fields: { [fieldId]: proposedContent } }  (한 번에 — MCP·스크립트용) */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { sectionId, seed } = (await req.json().catch(() => ({}))) as { sectionId?: string | null; seed?: string };
  const plan = planPrdDraft(id, sectionId, seed);
  if (!plan) return notFound();
  const r = await generateJson({ task: "prd.draft", system: MANNY_SYSTEM, prompt: plan.prompt, schema: prdSchema });
  const fields: Record<string, string> = {};
  for (const f of r.data.fields) if (plan.targets.some((t) => t.id === f.id)) fields[f.id] = f.content;
  activity.log(id, "ai.prd", sectionId ? plan.sections[0]?.title ?? "섹션" : "전체 PRD", { count: Object.keys(fields).length }, "manny");
  return ok({ fields, usage: r.usage });
});
