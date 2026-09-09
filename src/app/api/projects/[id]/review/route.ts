import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, reviews, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { REVIEW_PERSPECTIVES, REVIEW_PERSPECTIVE_LABEL, ITEM_TYPES, type ReviewPerspective } from "@/lib/types";
import {
  basicSchema, basicPrompt, basicToFinding, edgeSchema, edgePrompt, edgeToFinding, resolveTarget, EDGE_CASE_SYSTEM,
  type BasicPerspective, type RawFinding,
} from "@/lib/ai/reviewGen";

/** GET → { review, items } (latest) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const r = reviews.latest(id);
  return ok({ review: r ?? null, items: r ? reviews.items(r.id) : [] });
});

/** POST { perspectives } → 한 번에 검토(MCP·스크립트용). 화면은 `./stream` 을 써서 이슈가 생기는 대로 그린다. */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { perspectives?: string[] };
  const perspectives = (body.perspectives ?? [...REVIEW_PERSPECTIVES]).filter((x): x is ReviewPerspective => (REVIEW_PERSPECTIVES as readonly string[]).includes(x));
  if (!perspectives.length) return bad("관점을 하나 이상 선택하세요");

  const list = items.list(id).filter((i) => (ITEM_TYPES as readonly string[]).includes(i.type));
  const itemById = new Map(list.map((i) => [i.id, i]));
  const review = reviews.create(id, perspectives);
  const basic = perspectives.filter((x): x is BasicPerspective => x !== "edge_case");
  const wantsEdgeCase = perspectives.includes("edge_case");

  const results = await Promise.allSettled([
    basic.length
      ? generateJson({ task: "review.basic", system: MANNY_SYSTEM, prompt: basicPrompt(p, basic, list), schema: basicSchema })
          .then((r) => r.data.items.map((it) => basicToFinding(it, basic, itemById)).filter((x): x is RawFinding => !!x))
      : Promise.resolve([] as RawFinding[]),
    wantsEdgeCase
      ? generateJson({ task: "review.edge_case", system: EDGE_CASE_SYSTEM, prompt: edgePrompt(p, list), schema: edgeSchema })
          .then((r) => r.data.issues.map((it) => edgeToFinding(it, itemById)))
      : Promise.resolve([] as RawFinding[]),
  ]);
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error).message);
  const findings = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!findings.length && errors.length) { reviews.setStatus(review.id, "error"); return bad(`검토 실패: ${errors.join(" / ")}`, 500); }

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
