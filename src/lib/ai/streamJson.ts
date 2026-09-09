/**
 * "JSON 을 스트리밍으로 받아 항목이 완성될 때마다 콜백" — 라우트에서 반복되는 뼈대를 한 곳에.
 *
 *   await streamJsonArray({ task, system, prompt, schema, arrayKey: "decisions", itemSchema, onItem })
 *
 * 프롬프트는 generateJson 의 단일 턴 방식과 똑같이 스키마를 내장한다(출력 형태가 같아야 한다).
 * 배열 원소 객체가 닫히는 순간 itemSchema 로 검증해 onItem 을 부르고, 검증에 실패한 원소는 조용히 건너뛴다
 * (부분 실패로 전체를 버리지 않기 위해). 스칼라 값이 도착하는 즉시 반응하고 싶으면 onValue 를 쓴다.
 */
import type { z } from "zod";
import { generateStream, toJsonSchema, jsonOnlyInstruction, JSON_SYSTEM_SUFFIX } from "@/lib/ai";
import type { AiTask } from "@/lib/ai/policy";
import { JsonStreamParser, JsonAssembler, type JsonPath, type JsonScalar } from "@/lib/ai/jsonStream";

export interface StreamJsonOptions<S extends z.ZodTypeAny, I extends z.ZodTypeAny> {
  task: AiTask;
  system: string;
  prompt: string;
  /** 전체 출력 스키마(프롬프트 내장용) */
  schema: S;
  /** 루트 객체에서 배열이 달린 키 */
  arrayKey: string;
  /** 배열 원소 스키마(검증용) */
  itemSchema: I;
  onItem: (item: z.infer<I>, index: number) => void;
  /** 원소 안의 스칼라가 도착하는 즉시 (index, key, value). 제목을 먼저 그리는 용도. */
  onValue?: (index: number, key: string, value: JsonScalar) => void;
}

export async function streamJsonArray<S extends z.ZodTypeAny, I extends z.ZodTypeAny>(o: StreamJsonOptions<S, I>): Promise<{ count: number; raw: string }> {
  const parser = new JsonStreamParser();
  const asm = new JsonAssembler();
  let count = 0;
  const isItem = (p: JsonPath) => p.length === 2 && p[0] === o.arrayKey && typeof p[1] === "number";
  const r = await generateStream({
    task: o.task,
    system: `${o.system}\n\n${JSON_SYSTEM_SUFFIX}`,
    prompt: `${o.prompt}\n\n${jsonOnlyInstruction(toJsonSchema(o.schema))}`,
    onText: (delta) => {
      for (const ev of parser.feed(delta)) {
        asm.apply(ev);
        if (ev.type === "value" && o.onValue && ev.path.length === 3 && isItem(ev.path.slice(0, 2)) && typeof ev.path[2] === "string") {
          o.onValue(ev.path[1] as number, ev.path[2], ev.value);
        } else if (ev.type === "close" && ev.kind === "object" && isItem(ev.path)) {
          const parsed = o.itemSchema.safeParse(asm.get(ev.path));
          if (parsed.success) { count++; o.onItem(parsed.data, ev.path[1] as number); }
        }
      }
    },
  });
  return { count, raw: r.raw };
}

/**
 * 루트 바로 아래 객체의 키가 하나씩 완성될 때마다 콜백. `{ "slots": { "precondition": "...", ... } }` 처럼
 * 배열이 아니라 고정 키 묶음일 때 쓴다.
 */
export async function streamJsonObject<S extends z.ZodTypeAny>(o: {
  task: AiTask; system: string; prompt: string; schema: S; objectKey: string;
  onEntry: (key: string, value: JsonScalar) => void;
}): Promise<{ count: number; raw: string }> {
  const parser = new JsonStreamParser();
  let count = 0;
  const r = await generateStream({
    task: o.task,
    system: `${o.system}\n\n${JSON_SYSTEM_SUFFIX}`,
    prompt: `${o.prompt}\n\n${jsonOnlyInstruction(toJsonSchema(o.schema))}`,
    onText: (delta) => {
      for (const ev of parser.feed(delta)) {
        if (ev.type === "value" && ev.path.length === 2 && ev.path[0] === o.objectKey && typeof ev.path[1] === "string") {
          count++; o.onEntry(ev.path[1], ev.value);
        }
      }
    },
  });
  return { count, raw: r.raw };
}
