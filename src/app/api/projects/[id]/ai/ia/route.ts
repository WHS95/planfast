import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, pages, items, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import type { Page } from "@/lib/types";

/**
 * POST { mode: "generate" | "children" | "enrich", pageId?, seed? }
 *  generate → { pages: PageTree[] }             전체 정보구조 제안 (기존 페이지와 중복되지 않게)
 *  children → { pages: PageTree[], parentId }   특정 페이지의 하위 페이지 제안
 *  enrich   → { updates: {id,name,description}[] } 기존 페이지 이름/설명 보강
 *  link     → { links: {pageId, specIds[]}[] }  상세기능을 어느 화면에서 쓰는지 연결 제안
 *             (화면설계서의 to-do·정책 章이 이 연결을 근거로 채워진다)
 * 제안만 반환한다. 반영은 클라이언트가 /pages (bulk) 또는 /pages/[pageId]로 수행.
 */
const leaf = z.object({ name: z.string(), description: z.string() });
const lvl2 = leaf.extend({ children: z.array(leaf) });
const lvl1 = leaf.extend({ children: z.array(lvl2) });
const treeSchema = z.object({ pages: z.array(lvl1) });
const childrenSchema = z.object({ pages: z.array(lvl2) });
const enrichSchema = z.object({ updates: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })) });
const linkSchema = z.object({ links: z.array(z.object({ pageId: z.string(), specIds: z.array(z.string()) })) });

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
    const r = await generateJson({ task: "ia.generate", system: MANNY_SYSTEM, prompt, schema: treeSchema });
    activity.log(id, "ai.ia", "정보구조도 생성 제안", { count: r.data.pages.length }, "manny");
    return ok({ mode, pages: r.data.pages, parentId: null, usage: r.usage });
  }
  if (mode === "children") {
    const target = body.pageId ? pages.get(body.pageId) : undefined;
    if (!target || target.projectId !== id) return bad("pageId required");
    const sibs = existing.filter((x) => x.parentId === target.id).map((x) => x.name);
    const prompt = [text, existingMd, seed, `지시: "${pathOf(target, existing)}" 페이지(${target.description || "설명 없음"})의 하위 페이지를 제안하세요. 이미 있는 하위 페이지: ${sibs.length ? sibs.join(", ") : "(없음)"}. 3~7개, 필요하면 2단계까지.`, rules].filter(Boolean).join("\n\n");
    const r = await generateJson({ task: "ia.children", system: MANNY_SYSTEM, prompt, schema: childrenSchema });
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
    const r = await generateJson({ task: "ia.enrich", system: MANNY_SYSTEM, prompt, schema: enrichSchema });
    const valid = r.data.updates.filter((u) => targets.some((t) => t.id === u.id));
    activity.log(id, "ai.ia", "페이지 설명 보강 제안", { count: valid.length }, "manny");
    return ok({ mode, updates: valid, usage: r.usage });
  }
  if (mode === "link") {
    // 상세기능 제목은 동작("노쇼 카운트 집계"), 페이지 이름은 화면("출석 대시보드")이라 문자열 매칭이 통하지 않는다.
    // 의미를 아는 모델이 "이 동작은 어느 화면에서 일어나는가"를 판단하게 한다.
    const specs = items.list(id).filter((x) => x.type === "spec");
    if (!specs.length) return bad("연결할 상세기능이 없습니다. 기능명세서를 먼저 작성하세요.");
    if (!existing.length) return bad("연결할 페이지가 없습니다.");
    const itemAll = items.list(id);
    const specLine = (x: (typeof specs)[number]) => {
      const feat = itemAll.find((f) => f.id === x.parentId);
      return `- ${x.id} / ${x.title}${feat ? ` (기능: ${feat.title})` : ""}${x.description ? ` — ${x.description}` : ""}`;
    };
    const prompt = [text,
      "화면(정보구조도 페이지) 목록 — id / 경로 / 설명:", ...existing.map((x) => `- ${x.id} / ${pathOf(x, existing)} / ${x.description || "(설명 없음)"}`),
      "상세기능 목록 — id / 제목 / 설명:", ...specs.map(specLine),
      seed,
      "지시: 각 화면에서 실제로 사용되는 상세기능을 연결하세요. 판단 기준은 '이 동작이 사용자에게 보이거나 실행되는 화면이 어디인가'입니다.",
      "한 상세기능이 여러 화면에 걸칠 수 있고(예: 목록과 상세 모두), 어느 화면에도 속하지 않으면(순수 배치·서버 작업) 연결하지 않아도 됩니다.",
      "확실하지 않으면 억지로 연결하지 마세요. 반드시 위 목록에 있는 id만 사용하세요.",
    ].filter(Boolean).join("\n\n");
    const r = await generateJson({ task: "ia.link", system: MANNY_SYSTEM, prompt, schema: linkSchema });
    const pageIds = new Set(existing.map((x) => x.id));
    const specIds = new Set(specs.map((x) => x.id));
    // 모델이 지어낸 id 는 버린다.
    const links = r.data.links
      .filter((l) => pageIds.has(l.pageId))
      .map((l) => ({ pageId: l.pageId, specIds: [...new Set(l.specIds.filter((sid) => specIds.has(sid)))] }))
      .filter((l) => l.specIds.length);
    activity.log(id, "ai.ia", "상세기능 연결 제안", { count: links.length }, "manny");
    return ok({ mode, links, usage: r.usage });
  }
  return bad("unknown mode");
});
