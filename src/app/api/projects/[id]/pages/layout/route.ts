import { handler, ok, notFound, type Params } from "@/lib/http";
import { pages, projects, activity } from "@/lib/repo";

/**
 * POST { positions: [{id,x,y}] }  → 캔버스 좌표 일괄 저장(여러 노드 동시 이동)
 * POST { reset: true }            → 저장된 좌표 전부 삭제 = 자동 배치로 되돌리기
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { positions?: unknown; reset?: boolean };

  if (body.reset) {
    pages.clearPositions(id);
    activity.log(id, "ia.layout.reset", "정보구조도 자동 정렬");
    return ok(pages.list(id));
  }

  const positions = Array.isArray(body.positions)
    ? body.positions.filter((p): p is { id: string; x: number; y: number } =>
        !!p && typeof p === "object"
        && typeof (p as { id?: unknown }).id === "string"
        && Number.isFinite((p as { x?: unknown }).x)
        && Number.isFinite((p as { y?: unknown }).y))
    : [];
  if (positions.length) pages.setPositions(id, positions);
  return ok(pages.list(id));
});
