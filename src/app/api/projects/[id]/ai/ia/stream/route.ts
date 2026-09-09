import { z } from "zod";
import { handler, bad, notFound, type Params } from "@/lib/http";
import { projects, pages, activity } from "@/lib/repo";
import { generateStream, toJsonSchema, jsonOnlyInstruction, JSON_SYSTEM_SUFFIX } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import { JsonStreamParser, JsonAssembler } from "@/lib/ai/jsonStream";
import { sse } from "@/lib/sse";
import type { Page } from "@/lib/types";

/**
 * POST { mode: "generate" | "children", pageId?, seed? } → SSE
 *
 * 정보구조도 제안을 스트리밍한다. 제안은 저장하지 않고(반영/거절은 사용자가) 화면의 제안 패널에
 * 페이지가 하나씩 나타나게 한다.
 *
 * 이벤트
 *   page  { path: number[], name }               — 이름이 나오는 즉시. path 는 트리 안 위치([0], [0,2], [1,0,3] …)
 *   page  { path: number[], name, description }  — 객체가 닫히면 설명까지
 *   done  { count }
 *   error { message }
 */
const leaf = z.object({ name: z.string(), description: z.string() });
const lvl2 = leaf.extend({ children: z.array(leaf) });
const lvl1 = leaf.extend({ children: z.array(lvl2) });
const treeSchema = z.object({ pages: z.array(lvl1) });
const childrenSchema = z.object({ pages: z.array(lvl2) });

function pathOf(p: Page, all: Page[]): string {
  const parts = [p.name]; let cur = p;
  while (cur.parentId) { const par = all.find((x) => x.id === cur.parentId); if (!par) break; parts.unshift(par.name); cur = par; }
  return parts.join(" > ");
}

export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { mode?: "generate" | "children"; pageId?: string; seed?: string };
  const mode = body.mode ?? "generate";
  const existing = pages.list(id);
  const { text } = projectContext(id, { withIds: false });
  const existingMd = existing.length ? "현재 정보구조도 (경로: 설명):\n" + existing.map((x) => `- ${pathOf(x, existing)}${x.description ? `: ${x.description}` : ""}`).join("\n") : "현재 정보구조도: (비어 있음)";
  const seed = body.seed?.trim() ? `추가 요청: ${body.seed.trim()}` : "";
  const rules = "규칙: 페이지 이름은 짧은 한국어 명사구(예: 홈, 로그인, 상품 상세). 설명은 그 페이지의 목적과 핵심 요소를 1~2문장으로. 기능명세서의 기능/상세기능이 어느 페이지에 배치되는지 드러나게 구성. 최대 3단계 깊이. 이미 존재하는 페이지와 같은 이름은 만들지 마세요. 각 객체는 name 을 첫 번째 키로 쓰세요.";

  let prompt: string; let schema: z.ZodTypeAny; let task: "ia.generate" | "ia.children"; let label: string; let parentId: string | null = null;
  if (mode === "children") {
    const target = body.pageId ? pages.get(body.pageId) : undefined;
    if (!target || target.projectId !== id) return bad("pageId required");
    const sibs = existing.filter((x) => x.parentId === target.id).map((x) => x.name);
    prompt = [text, existingMd, seed, `지시: "${pathOf(target, existing)}" 페이지(${target.description || "설명 없음"})의 하위 페이지를 제안하세요. 이미 있는 하위 페이지: ${sibs.length ? sibs.join(", ") : "(없음)"}. 3~7개, 필요하면 2단계까지.`, rules].filter(Boolean).join("\n\n");
    schema = childrenSchema; task = "ia.children"; label = `하위 페이지 제안: ${target.name}`; parentId = target.id;
  } else {
    prompt = [text, existingMd, seed, "지시: 이 제품의 정보구조도(IA, 페이지 트리)를 제안하세요. 최상위에는 주요 메뉴/영역 페이지, 그 아래에 세부 페이지를 배치합니다. 기존 페이지가 있으면 빠진 부분만 추가 제안하세요.", rules].filter(Boolean).join("\n\n");
    schema = treeSchema; task = "ia.generate"; label = "정보구조도 생성 제안";
  }

  return sse(async (send) => {
    const parser = new JsonStreamParser();
    const asm = new JsonAssembler();
    let count = 0;
    // 객체 경로(["pages",0,"children",2]) → 인덱스만 뽑은 트리 위치([0,2])
    const treePath = (objPath: (string | number)[]) => objPath.filter((x) => typeof x === "number") as number[];
    const isPageObj = (objPath: (string | number)[]) => objPath.length >= 2 && typeof objPath[objPath.length - 1] === "number" && (objPath[objPath.length - 2] === "pages" || objPath[objPath.length - 2] === "children");

    await generateStream({
      task, system: `${MANNY_SYSTEM}\n\n${JSON_SYSTEM_SUFFIX}`, prompt: `${prompt}\n\n${jsonOnlyInstruction(toJsonSchema(schema))}`,
      onText: (delta) => {
        for (const ev of parser.feed(delta)) {
          asm.apply(ev);
          if (ev.type === "value" && ev.path[ev.path.length - 1] === "name" && typeof ev.value === "string" && ev.value.trim()) {
            const objPath = ev.path.slice(0, -1);
            if (!isPageObj(objPath)) continue;
            count++;
            send("page", { path: treePath(objPath), name: ev.value.trim() });
          } else if (ev.type === "close" && ev.kind === "object" && isPageObj(ev.path)) {
            const raw = asm.get(ev.path) as { name?: string; description?: string } | undefined;
            if (raw?.name) send("page", { path: treePath(ev.path), name: raw.name.trim(), description: (raw.description ?? "").trim() });
          }
        }
      },
    });
    activity.log(id, "ai.ia", label, { count, streamed: true }, "manny");
    send("done", { mode, parentId, count });
  });
});
