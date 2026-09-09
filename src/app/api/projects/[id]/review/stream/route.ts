import { handler, bad, notFound, type Params } from "@/lib/http";
import { projects, items, reviews, activity } from "@/lib/repo";
import { MANNY_SYSTEM } from "@/lib/ai/context";
import { sse } from "@/lib/sse";
import { streamJsonArray } from "@/lib/ai/streamJson";
import { REVIEW_PERSPECTIVES, REVIEW_PERSPECTIVE_LABEL, ITEM_TYPES, type ReviewPerspective } from "@/lib/types";
import {
  basicSchema, basicFindingSchema, basicPrompt, basicToFinding, edgeSchema, edgeIssueSchema, edgePrompt, edgeToFinding, resolveTarget, EDGE_CASE_SYSTEM,
  type BasicPerspective, type RawFinding,
} from "@/lib/ai/reviewGen";

/**
 * POST { perspectives } → SSE
 *
 * 검토는 가장 오래 걸리는 작업이다(정합성 감사는 Fable 로 3~5분). 이슈가 하나씩 저장되는 대로 밀어줘서
 * 첫 이슈부터 읽기 시작할 수 있게 한다. 기본 6관점과 정합성 감사는 **동시에** 돌고 같은 스트림에 섞여 들어온다.
 *
 * 이벤트
 *   review { review }          — 검토 행 생성 직후
 *   item   { item }            — 이슈 하나 저장될 때마다
 *   lane   { lane, status, error? } — 기본/감사 각 줄기의 완료·실패
 *   done   { review, count, errors }
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const body = (await req.json().catch(() => ({}))) as { perspectives?: string[] };
  const perspectives = (body.perspectives ?? [...REVIEW_PERSPECTIVES]).filter((x): x is ReviewPerspective => (REVIEW_PERSPECTIVES as readonly string[]).includes(x));
  if (!perspectives.length) return bad("관점을 하나 이상 선택하세요");

  const list = items.list(id).filter((i) => (ITEM_TYPES as readonly string[]).includes(i.type));
  const itemById = new Map(list.map((i) => [i.id, i]));
  const basic = perspectives.filter((x): x is BasicPerspective => x !== "edge_case");
  const wantsEdgeCase = perspectives.includes("edge_case");

  return sse(async (send) => {
    const review = reviews.create(id, perspectives);
    send("review", { review });
    let saved = 0;
    const errors: string[] = [];
    const persist = (f: RawFinding) => {
      const resolved = resolveTarget(p, itemById, f.target);
      if (!resolved) return;
      const row = reviews.addItem({ reviewId: review.id, projectId: id, perspective: f.perspective, severity: f.severity, target: resolved.target, targetLabel: resolved.label, title: f.title, body: f.body });
      saved++;
      send("item", { item: row });
    };
    const lanes: Promise<void>[] = [];
    if (basic.length) lanes.push(
      streamJsonArray({ task: "review.basic", system: MANNY_SYSTEM, prompt: basicPrompt(p, basic, list), schema: basicSchema, arrayKey: "items", itemSchema: basicFindingSchema,
        onItem: (it) => { const f = basicToFinding(it, basic, itemById); if (f) persist(f); } })
        .then(() => send("lane", { lane: "basic", status: "done" }))
        .catch((e: Error) => { errors.push(e.message); send("lane", { lane: "basic", status: "error", error: e.message }); }),
    );
    if (wantsEdgeCase) lanes.push(
      streamJsonArray({ task: "review.edge_case", system: EDGE_CASE_SYSTEM, prompt: edgePrompt(p, list), schema: edgeSchema, arrayKey: "issues", itemSchema: edgeIssueSchema,
        onItem: (it) => persist(edgeToFinding(it, itemById)) })
        .then(() => send("lane", { lane: "edge_case", status: "done" }))
        .catch((e: Error) => { errors.push(e.message); send("lane", { lane: "edge_case", status: "error", error: e.message }); }),
    );
    await Promise.all(lanes);
    reviews.setStatus(review.id, saved === 0 && errors.length ? "error" : "done");
    activity.log(id, "review.run", perspectives.map((k) => REVIEW_PERSPECTIVE_LABEL[k]).join("/"), { count: saved, errors: errors.length || undefined, streamed: true }, "manny");
    send("done", { review: reviews.get(review.id), count: saved, errors });
  });
});
