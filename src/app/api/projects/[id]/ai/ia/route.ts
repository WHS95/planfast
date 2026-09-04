import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, pages, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import type { Page } from "@/lib/types";

/**
 * POST { mode: "generate" | "children" | "enrich", pageId?, seed? }
 *  generate → { pages: PageTree[] }             전체 정보구조 제안 (기존 페이지와 중복되지 않게)
 *  children → { pages: PageTree[], parentId }   특정 페이지의 하위 페이지 제안
 *  enrich   → { updates: {id,name,description}[] } 기존 페이지 이름/설명 보강
 * 제안만 반환한다. 반영은 클라이언트가 /pages (bulk) 또는 /pages/[pageId]로 수행.
 */
const leaf = z.object({ name: z.string(), description: z.string() });
const lvl2 = leaf.extend({ children: z.array(leaf) });
const lvl1 = leaf.extend({ children: z.array(lvl2) });
const treeSchema = z.object({ pages: z.array(lvl1) });
const childrenSchema = z.object({ pages: z.array(lvl2) });
const enrichSchema = z.object({ updates: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })) });

function pathOf(p: Page, all: Page[]): string {
  const parts = [p.name]; let cur = p;
  while (cur.parentId) { const par = all.find((x) => x.id === cur.parentId); if (!par) break; parts.unshift(par.name); cur = par; }
  return parts.join(" > ");
}

export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { mode?: string; pageId?: string; seed?: string };
  const mode = body.mode ?? "generate";
  const existing = pages.list(id);
  const { text } = projectContext(id, { withIds: false });
  const existingMd = existing.length ? "현재 정보구조도 (경로: 설명):\n" + existing.map((x) => `- ${pathOf(x, existing)}${x.description ? `: ${x.description}` : ""}`).join("\n") : "현재 정보구조도: (비어 있음)";
  const seed = body.seed?.trim() ? `추가 요청: ${body.seed.trim()}` : "";
  const rules = "규칙: 페이지 이름은 짧은 한국어 명사구(예: 홈, 로그인, 상품 상세). 설명은 그 페이지의 목적과 핵심 요소를 1~2문장으로. 기능명세서의 기능/상세기능이 어느 페이지에 배치되는지 드러나게 구성. 최대 3단계 깊이. 이미 존재하는 페이지와 같은 이름은 만들지 마세요.";

  if (mode === "generate") {
    const prompt = [text, existingMd, seed, "지시: 이 제품의 정보구조도(IA, 페이지 트리)를 제안하세요. 최상위에는 주요 메뉴/영역 페이지, 그 아래에 세부 페이지를 배치합니다. 기존 페이지가 있으면 빠진 부분만 추가 제안하세요.", rules].filter(Boolean).join("\n\n");
    const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema: treeSchema });
    activity.log(id, "ai.ia", "정보구조도 생성 제안", { count: r.data.pages.length }, "manny");
    return ok({ mode, pages: r.data.pages, parentId: null, usage: r.usage });
  }
  if (mode === "children") {
    const target = body.pageId ? pages.get(body.pageId) : undefined;
    if (!target || target.projectId !== id) return bad("pageId required");
    const sibs = existing.filter((x) => x.parentId === target.id).map((x) => x.name);
    const prompt = [text, existingMd, seed, `지시: "${pathOf(target, existing)}" 페이지(${target.description || "설명 없음"})의 하위 페이지를 제안하세요. 이미 있는 하위 페이지: ${sibs.length ? sibs.join(", ") : "(없음)"}. 3~7개, 필요하면 2단계까지.`, rules].filter(Boolean).join("\n\n");
    const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema: childrenSchema });
    activity.log(id, "ai.ia", `하위 페이지 제안: ${target.name}`, { count: r.data.pages.length }, "manny");
    return ok({ mode, pages: r.data.pages, parentId: target.id, usage: r.usage });
  }
  if (mode === "enrich") {
    const targets = body.pageId ? existing.filter((x) => x.id === body.pageId) : existing;
    if (!targets.length) return bad("no pages to enrich");
    const prompt = [text, existingMd, seed,
      "보강할 페이지 목록 (id / 경로 / 현재 설명):", ...targets.map((x) => `- ${x.id} / ${pathOf(x, existing)} / ${x.description || "(비어 있음)"}`),
      "지시: 각 페이지의 이름을 더 명확하게 다듬고(대부분 그대로 두어도 됨), 설명을 1~2문장으로 구체적으로 작성하세요. 페이지에 포함될 핵심 UI 요소와 연결된 기능을 언급하세요. 모든 id를 빠짐없이 포함.",
    ].filter(Boolean).join("\n\n");
    const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema: enrichSchema });
    const valid = r.data.updates.filter((u) => targets.some((t) => t.id === u.id));
    activity.log(id, "ai.ia", "페이지 설명 보강 제안", { count: valid.length }, "manny");
    return ok({ mode, updates: valid, usage: r.usage });
  }
  return bad("unknown mode");
});
