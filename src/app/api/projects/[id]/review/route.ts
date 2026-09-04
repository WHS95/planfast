import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, reviews, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { REVIEW_PERSPECTIVES, REVIEW_PERSPECTIVE_LABEL, ITEM_TYPES, type ReviewPerspective } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = { requirement: "요구사항", feature: "기능", spec: "상세기능" };

/** GET → { review, items } (latest) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const r = reviews.latest(id);
  return ok({ review: r ?? null, items: r ? reviews.items(r.id) : [] });
});

const PERSPECTIVE_HINT: Record<ReviewPerspective, string> = {
  dev: "구현 가능성, 데이터 모델·API·상태 정의 누락, 기술적 모호성, 예외 처리",
  business: "수익·비용 구조, 시장 적합성, 운영 정책, 법적·약관 이슈, 우선순위 타당성",
  ux: "사용자 여정의 끊김, 인지 부하, 접근성, 에러 상황 안내, 온보딩",
  design: "화면 구성 요소 정의 누락, 상태(빈/로딩/에러) 정의, 일관성",
  qa: "테스트 가능한 수용 기준 부재, 경계 조건, 회귀 위험, 검증 시나리오 누락",
  security: "인증·인가, 개인정보, 입력 검증, 권한 상승, 데이터 보관·삭제 정책",
};

/** POST { perspectives } → run review synchronously */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { perspectives?: string[] };
  const perspectives = (body.perspectives ?? [...REVIEW_PERSPECTIVES]).filter((x): x is ReviewPerspective => (REVIEW_PERSPECTIVES as readonly string[]).includes(x));
  if (!perspectives.length) return bad("관점을 하나 이상 선택하세요");

  const list = items.list(id).filter((i) => (ITEM_TYPES as readonly string[]).includes(i.type));
  const review = reviews.create(id, perspectives);
  const schema = z.object({
    items: z.array(z.object({
      perspective: z.enum(REVIEW_PERSPECTIVES),
      severity: z.enum(["warn", "suggest"]).describe("warn=주의(문제/누락), suggest=제안(개선)"),
      target: z.string().describe('"prd:<섹션키>" 또는 "item:<항목id>"'),
      title: z.string().describe("한 줄 제목"),
      body: z.string().describe("근거와 구체적 개선안 2~4문장"),
    })),
  });
  const prompt = [
    `# 프로젝트: ${p.title}`, p.description,
    "# PRD (섹션키: " + p.prd.sections.map((s) => `${s.key === "custom" ? s.id : s.key}=${s.title}`).join(", ") + ")",
    prdToMarkdown(p.prd),
    "# 기능명세서 (각 항목의 [id] 사용)",
    itemsToMarkdown(list, { withIds: true }) || "(항목 없음)",
    "# 검토 관점", ...perspectives.map((k) => `- ${k} (${REVIEW_PERSPECTIVE_LABEL[k]}): ${PERSPECTIVE_HINT[k]}`),
    "지시: 선택된 관점별로 PRD와 기능명세서를 검토해 문제(warn)와 개선 제안(suggest)을 찾으세요. 관점당 2~5개, 전체 20개 이내. target은 반드시 위에 있는 섹션키 또는 항목 id를 사용. 유저플로우·와이어프레임은 검토 대상이 아닙니다. 구체적이고 실행 가능하게 한국어로.",
  ].filter(Boolean).join("\n\n");

  try {
    const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema });
    const secByKey = new Map(p.prd.sections.map((s) => [s.key === "custom" ? s.id : s.key, s]));
    const itemById = new Map(list.map((i) => [i.id, i]));
    let saved = 0;
    for (const it of r.data.items) {
      if (!perspectives.includes(it.perspective)) continue;
      let target = it.target.trim();
      let label = "";
      if (target.startsWith("prd:")) {
        const key = target.slice(4);
        const sec = secByKey.get(key) ?? p.prd.sections.find((s) => s.title === key);
        if (!sec) continue;
        target = `prd:${sec.key === "custom" ? sec.id : sec.key}`;
        label = `PRD · ${sec.title}`;
      } else if (target.startsWith("item:")) {
        const item = itemById.get(target.slice(5));
        if (!item) continue;
        label = `${TYPE_LABEL[item.type]} · ${item.title || "(제목 없음)"}`;
      } else continue;
      reviews.addItem({ reviewId: review.id, projectId: id, perspective: it.perspective, severity: it.severity, target, targetLabel: label, title: it.title, body: it.body });
      saved++;
    }
    reviews.setStatus(review.id, "done");
    activity.log(id, "review.run", perspectives.map((k) => REVIEW_PERSPECTIVE_LABEL[k]).join("/"), { count: saved }, "manny");
    return ok({ review: reviews.get(review.id), items: reviews.items(review.id) });
  } catch (e) {
    reviews.setStatus(review.id, "error");
    return bad(`검토 실패: ${(e as Error).message}`, 500);
  }
});
