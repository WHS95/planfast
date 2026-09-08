import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, reviews, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { REVIEW_PERSPECTIVES, REVIEW_PERSPECTIVE_LABEL, ITEM_TYPES, type Project, type ReviewPerspective, type ReviewItem } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = { requirement: "요구사항", feature: "기능", spec: "상세기능" };
const BASIC_PERSPECTIVES = REVIEW_PERSPECTIVES.filter((p) => p !== "edge_case") as Exclude<ReviewPerspective, "edge_case">[];

/** GET → { review, items } (latest) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const r = reviews.latest(id);
  return ok({ review: r ?? null, items: r ? reviews.items(r.id) : [] });
});

const PERSPECTIVE_HINT: Record<Exclude<ReviewPerspective, "edge_case">, string> = {
  dev: "구현 가능성, 데이터 모델·API·상태 정의 누락, 기술적 모호성, 예외 처리",
  business: "수익·비용 구조, 시장 적합성, 운영 정책, 법적·약관 이슈, 우선순위 타당성",
  ux: "사용자 여정의 끊김, 인지 부하, 접근성, 에러 상황 안내, 온보딩",
  design: "화면 구성 요소 정의 누락, 상태(빈/로딩/에러) 정의, 일관성",
  qa: "테스트 가능한 수용 기준 부재, 경계 조건, 회귀 위험, 검증 시나리오 누락",
  security: "인증·인가, 개인정보, 입력 검증, 권한 상승, 데이터 보관·삭제 정책",
};

interface RawFinding { perspective: ReviewPerspective; severity: ReviewItem["severity"]; target: string; title: string; body: string }

/**
 * Resolve a raw AI `target` string to a stored target + human label. Returns null if invalid.
 * Accepts the documented "prd:<key>" / "item:<id>" forms, but models (especially under a long,
 * methodology-heavy system prompt) sometimes drop the prefix and emit a bare id or section title —
 * so fall back to matching a bare string against known item ids, then PRD section keys/titles.
 */
function resolveTarget(p: Project, itemById: Map<string, ReturnType<typeof items.list>[number]>, raw: string): { target: string; label: string } | null {
  const secByKey = new Map(p.prd.sections.map((s) => [s.key === "custom" ? s.id : s.key, s]));
  let target = raw.trim();
  // strip stray brackets/backticks the model sometimes wraps ids in, e.g. "[abc123]" or "`abc123`"
  target = target.replace(/^[`[]+|[`\]]+$/g, "").trim();
  const bare = target.startsWith("prd:") ? target.slice(4) : target.startsWith("item:") ? target.slice(5) : target;

  const item = itemById.get(bare);
  if (item) return { target: `item:${item.id}`, label: `${TYPE_LABEL[item.type]} · ${item.title || "(제목 없음)"}` };

  const sec = secByKey.get(bare) ?? p.prd.sections.find((s) => s.title === bare);
  if (sec) return { target: `prd:${sec.key === "custom" ? sec.id : sec.key}`, label: `PRD · ${sec.title}` };

  return null;
}

/** 기본 6개 관점: 한 번의 호출로 처리 (기존 동작 그대로). */
async function runBasicPerspectives(p: Project, perspectives: Exclude<ReviewPerspective, "edge_case">[], list: ReturnType<typeof items.list>): Promise<RawFinding[]> {
  const schema = z.object({
    items: z.array(z.object({
      perspective: z.enum(BASIC_PERSPECTIVES),
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
  const r = await generateJson({ task: "review.basic", system: MANNY_SYSTEM, prompt, schema });
  return r.data.items.filter((it) => perspectives.includes(it.perspective as Exclude<ReviewPerspective, "edge_case">));
}

const EDGE_CASE_SYSTEM = `당신은 "spec-edge-case-auditor" 방법론을 수행하는 정합성 감사관입니다.
느낌으로 문제를 찾지 말고, 문서를 규칙 단위로 분해한 뒤 구조(상태×행동 매트릭스)·경계값·비정상 흐름·문장(5W1H) 순서로 기계적으로 훑고, 마지막에 이슈를 정리합니다.

핵심 원칙:
1. 문서에 없는 규칙을 지어내서 채우지 않습니다. 빈칸(암묵 상태·미정의 조합)은 그 자체로 이슈입니다.
2. 이슈는 지적이 아니라 "기획자가 답하면 문서가 좋아지는 질문"입니다. 가능하면 2~3개 선택지(A/B/C)를 제시하되, 정답처럼 쓰지 않습니다.
3. "확인 필요", "검토 요망" 같은 뭉뚱그린 표현을 쓰지 않습니다. 누가 무엇을 결정해야 하는지 구체적으로.
4. 비즈니스 정책 자체의 옳고 그름에는 개입하지 않습니다. 정책이 서로 충돌하거나 비어 있을 때만 지적합니다.

내부적으로 다음 단계를 순서대로 수행한 뒤 최종 이슈만 출력하세요 (중간 산출물은 출력하지 않음):
[0] 분해: 요구사항/기능/상세기능 각 항목을 REQ로 보고, 주어(누가)·조건(언제)·행동(무엇을)·결과가 문서에 있는지 확인.
[1] 구조: 엔티티별 상태 후보(암묵 상태 포함: 처리 중/부분 실패/삭제 대기/만료 직전 등)와 행위자(비회원, 정지/탈퇴 진행 중 사용자, 관리자, 시스템/배치 포함) × 행동 조합 중 미정의·모순 조합을 찾는다.
[2] 경계값: 입력 필드·시간 조건·수량 조건마다 최소/최대/0/음수/동시성 처리가 문서에 있는지 확인.
[3] 비정상 흐름: 뒤로가기, 새로고침, 중복 클릭, 딥링크 진입, 네트워크 단절, 동시 요청 등에서 처리 방법이 있는지 확인.
[4] 5W1H: 남은 REQ마다 who/when/what/where/why/how 중 빠지거나 상충하는 부분을 찾는다.
[5] 통합: 같은 원인의 이슈는 하나로 합치고, 심각도(S1=금전·데이터 손상 > S2=기능 불가·상태 꼬임 > S3=UX·문구)로 태깅.`;

/** edge_case: spec-edge-case-auditor 방법론 기반 정합성 감사. 항상 Claude Fable 5.1로 실행. */
async function runEdgeCaseAudit(p: Project, list: ReturnType<typeof items.list>): Promise<RawFinding[]> {
  const schema = z.object({
    issues: z.array(z.object({
      severity: z.enum(["critical", "warn", "suggest"]).describe("critical=S1(금전·데이터 손상), warn=S2(기능 불가·상태 꼬임), suggest=S3(UX·문구)"),
      target: z.string().describe('가장 관련 있는 대상 하나만: PRD 섹션이면 "prd:<섹션키>", 기능명세서 항목이면 대괄호·백틱 없이 그 항목의 id 문자열 그대로 (예: prd:overview 또는 6fl7vwwm0cgv)'),
      title: z.string().describe("한 줄 제목 (예: REQ 참조 포함)"),
      question: z.string().describe("기획자가 결정하면 문서가 좋아지는 질문. 근거와 함께, 가능하면 2~3개 선택지(A/B/C)를 포함해 3~6문장으로."),
    })),
  });
  const prompt = [
    `# 프로젝트: ${p.title}`, p.description,
    "# PRD (섹션키: " + p.prd.sections.map((s) => `${s.key === "custom" ? s.id : s.key}=${s.title}`).join(", ") + ")",
    prdToMarkdown(p.prd),
    "# 기능명세서 — 요구사항 → 기능 → 상세기능 (각 항목의 [id]를 REQ 참조로 사용)",
    itemsToMarkdown(list, { withIds: true }) || "(항목 없음)",
    "지시: 위 방법론([0]~[5])을 내부적으로 수행한 뒤, 최종 이슈만 출력하세요. 최대 25개, 심각도 순(S1 먼저). target은 반드시 위에 있는 섹션키 또는 항목 id 중 하나. 문서에 없는 사실을 지어내지 마세요 — 빈칸은 빈칸인 채로 이슈화하세요. 한국어로.",
  ].filter(Boolean).join("\n\n");
  const r = await generateJson({ task: "review.edge_case", system: EDGE_CASE_SYSTEM, prompt, schema });
  return r.data.issues.map((it) => ({ perspective: "edge_case" as const, severity: it.severity, target: it.target, title: it.title, body: it.question }));
}

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
  const basic = perspectives.filter((x): x is Exclude<ReviewPerspective, "edge_case"> => x !== "edge_case");
  const wantsEdgeCase = perspectives.includes("edge_case");

  const results = await Promise.allSettled([
    basic.length ? runBasicPerspectives(p, basic, list) : Promise.resolve([]),
    wantsEdgeCase ? runEdgeCaseAudit(p, list) : Promise.resolve([]),
  ]);
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error).message);
  const findings = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  if (!findings.length && errors.length) {
    reviews.setStatus(review.id, "error");
    return bad(`검토 실패: ${errors.join(" / ")}`, 500);
  }

  const itemById = new Map(list.map((i) => [i.id, i]));
  let saved = 0;
  for (const it of findings) {
    const resolved = resolveTarget(p, itemById, it.target);
    if (!resolved) continue;
    reviews.addItem({ reviewId: review.id, projectId: id, perspective: it.perspective, severity: it.severity, target: resolved.target, targetLabel: resolved.label, title: it.title, body: it.body });
    saved++;
  }
  reviews.setStatus(review.id, "done");
  activity.log(id, "review.run", perspectives.map((k) => REVIEW_PERSPECTIVE_LABEL[k]).join("/"), { count: saved, errors: errors.length || undefined }, "manny");
  return ok({ review: reviews.get(review.id), items: reviews.items(review.id), warning: errors.length ? errors.join(" / ") : undefined });
});
