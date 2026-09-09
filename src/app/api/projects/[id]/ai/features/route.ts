import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import type { Item, ItemType } from "@/lib/types";
import {
  planFeaturesGen, specRow, featureRow, requirementRow,
  type ProposedSpec, type ProposedFeature, type ProposedRequirement, type GenMode,
} from "@/lib/ai/featuresGen";
export type { ProposedSpec, ProposedFeature, ProposedRequirement } from "@/lib/ai/featuresGen";

/** Result of an in-place generation: the rows are already in the DB with `aiProposed: true`. */
export interface FeaturesGenerateResult {
  mode: "generate" | "extend";
  parentId: string | null;
  parentType: ItemType | null;
  created: Item[];
  usage?: { input: number; output: number; costUsd?: number };
}

// ---------------------------------------------------------------- persistence
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
 * 한 번에 결과를 돌려주는 경로(MCP·스크립트용). 화면은 `./stream` 을 써서 생기는 대로 그린다.
 * 생성 결과는 곧바로 aiProposed=true / status="proposed" 로 저장된다 → FeaturesGenerateResult
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const { mode = "generate", parentId = null, hint = "" } = (await req.json().catch(() => ({}))) as { mode?: GenMode; parentId?: string | null; hint?: string };
  const plan = planFeaturesGen(id, mode, parentId, hint);
  if (typeof plan === "string") return plan === "parent not found" ? notFound(plan) : bad(plan);

  const r = await generateJson({ task: plan.task, system: MANNY_SYSTEM, prompt: plan.prompt, schema: plan.schema });
  const data = r.data as { requirements?: ProposedRequirement[]; features?: ProposedFeature[]; specs?: ProposedSpec[] };
  const created = plan.rootKey === "requirements" ? persistRequirements(id, data.requirements ?? [])
    : plan.rootKey === "features" ? persistFeatures(id, plan.parent!.id, data.features ?? [])
    : persistSpecs(id, plan.parent!.id, data.specs ?? []);
  activity.log(id, "ai.features", plan.logLabel, { mode: plan.mode, parentId: plan.parent?.id ?? null, count: created.length, aiProposed: true }, "manny");
  return ok({ mode: plan.mode, parentId: plan.parent?.id ?? null, parentType: plan.parent?.type ?? null, created, usage: r.usage } satisfies FeaturesGenerateResult);
});
