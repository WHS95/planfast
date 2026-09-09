import { handler, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import { generateStream, toJsonSchema, jsonOnlyInstruction, JSON_SYSTEM_SUFFIX } from "@/lib/ai";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { JsonStreamParser, JsonAssembler, type JsonPath } from "@/lib/ai/jsonStream";
import { sse } from "@/lib/sse";
import { planFeaturesGen, specSchema, featureSchema, requirementSchema, specRow, featureRow, requirementRow, type GenMode } from "@/lib/ai/featuresGen";
import type { Item, ItemType } from "@/lib/types";

/**
 * POST { mode, parentId?, hint? } → SSE
 *
 * 일반 라우트와 같은 프롬프트로 생성하되, 모델이 JSON 을 쓰는 동안 **제목이 나오는 즉시** 항목을
 * 만들어 화면에 밀어준다. 60초짜리 스피너 대신 사람이 쓰듯 노드가 하나씩 생겨난다.
 *
 * 이벤트
 *   item     { item: Item, kind: "create" | "update" }   — 제목이 나오면 create, 객체가 닫히면 update(설명·슬롯 채움)
 *   progress { requirement, feature, spec, current }      — 지금까지 만든 개수와 방금 쓴 제목
 *   done     { created: number }
 *   error    { message }                                   — 도중에 실패해도 이미 만든 항목은 남는다(aiProposed 라 거절 가능)
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const { mode = "generate", parentId = null, hint = "" } = (await req.json().catch(() => ({}))) as { mode?: GenMode; parentId?: string | null; hint?: string };
  const plan = planFeaturesGen(id, mode, parentId, hint);
  if (typeof plan === "string") return bad(plan);

  return sse(async (send) => {
    const parser = new JsonStreamParser();
    const asm = new JsonAssembler();
    /** 경로 접두(JSON 문자열) → 만들어둔 항목 id */
    const created = new Map<string, string>();
    const counts: Record<ItemType, number> = { requirement: 0, feature: 0, spec: 0 };
    let last = "";
    const createdIds: string[] = [];

    // 경로를 보고 "어느 항목의, 무슨 타입인지"를 알아낸다.
    //   generate: requirements[i] / requirements[i].features[j] / ...features[j].specs[k]
    //   extend(요구사항): features[j] / features[j].specs[k]
    //   extend(기능):     specs[k]
    const typeOf = (objPath: JsonPath): ItemType | null => {
      const keys = objPath.filter((p) => typeof p === "string") as string[];
      const leaf = keys[keys.length - 1];
      if (leaf === "requirements") return "requirement";
      if (leaf === "features") return "feature";
      if (leaf === "specs") return "spec";
      return null;
    };
    const parentIdOf = (objPath: JsonPath): string | null => {
      // 상위 객체 경로 = 마지막 두 원소(key, index) 제거
      if (objPath.length <= 2) return plan.parent?.id ?? null;
      return created.get(JSON.stringify(objPath.slice(0, -2))) ?? plan.parent?.id ?? null;
    };

    const ensureCreated = (objPath: JsonPath, title: string) => {
      const key = JSON.stringify(objPath);
      if (created.has(key)) return created.get(key)!;
      const type = typeOf(objPath);
      if (!type) return null;
      const it = items.create({ projectId: id, type, parentId: parentIdOf(objPath), title, description: "", status: "proposed", aiProposed: true });
      created.set(key, it.id);
      createdIds.push(it.id);
      counts[type]++;
      last = title;
      send("item", { item: it, kind: "create" });
      send("progress", { ...counts, current: title });
      return it.id;
    };

    const finalize = (objPath: JsonPath) => {
      const type = typeOf(objPath);
      if (!type) return;
      const raw = asm.get(objPath);
      const schema = type === "requirement" ? requirementSchema : type === "feature" ? featureSchema : specSchema;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return; // 부분 실패는 조용히 — 이미 제목은 화면에 있다
      const d = parsed.data;
      const itemId = ensureCreated(objPath, d.title) ?? created.get(JSON.stringify(objPath));
      if (!itemId) return;
      const row = type === "requirement" ? requirementRow(d as never) : type === "feature" ? featureRow(d as never, null) : specRow(d as never, null);
      const updated = items.update(itemId, { title: row.title, description: row.description, data: row.data as Partial<Item["data"]> });
      if (updated) send("item", { item: updated, kind: "update" });
    };

    const onText = (delta: string) => {
      for (const ev of parser.feed(delta)) {
        asm.apply(ev);
        if (ev.type === "value" && ev.path[ev.path.length - 1] === "title" && typeof ev.value === "string" && ev.value.trim()) {
          ensureCreated(ev.path.slice(0, -1), ev.value.trim());
        } else if (ev.type === "close" && ev.kind === "object" && ev.path.length >= 2 && typeof ev.path[ev.path.length - 1] === "number") {
          finalize(ev.path);
        }
      }
    };

    const jsonSchema = toJsonSchema(plan.schema);
    await generateStream({
      task: plan.task,
      system: `${MANNY_SYSTEM}\n\n${JSON_SYSTEM_SUFFIX}`,
      prompt: `${plan.prompt}\n\n${jsonOnlyInstruction(jsonSchema)}`,
      onText,
    });

    activity.log(id, "ai.features", plan.logLabel, { mode: plan.mode, parentId: plan.parent?.id ?? null, count: createdIds.length, aiProposed: true, streamed: true }, "manny");
    send("done", { created: createdIds.length, ...counts, last });
  });
});
