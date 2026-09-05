import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, activity } from "@/lib/repo";
import type { Item } from "@/lib/types";

export type ProposalAction = "approve" | "reject";
export interface ProposalsResult {
  action: ProposalAction;
  /** ids that were approved (approve) or deleted (reject) */
  affected: string[];
  /** the project's full item list after the operation */
  items: Item[];
}

/** ids + every descendant of those ids */
function withDescendants(all: Item[], ids: string[]): Set<string> {
  const out = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of all) if (it.parentId && out.has(it.parentId) && !out.has(it.id)) { out.add(it.id); changed = true; }
  }
  return out;
}

/**
 * POST { action: "approve"|"reject", ids?: string[] }
 * 매니가 제안한(aiProposed) 항목을 한 번에 승인/거절한다. `ids`를 생략하면 프로젝트의 모든 제안이 대상.
 * 승인: aiProposed=false (status가 "proposed"였다면 "writing"으로), 거절: 항목과 하위 항목 삭제.
 * 선택 승인/거절 시 대상의 하위 제안 항목도 함께 처리된다.
 */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown };
  const action = body.action;
  if (action !== "approve" && action !== "reject") return bad('action은 "approve" 또는 "reject" 여야 합니다');
  if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== "string"))) return bad("ids는 문자열 배열이어야 합니다");

  const all = items.list(id);
  const requested = (body.ids as string[] | undefined)?.filter((x) => all.some((it) => it.id === x));
  // no ids → every proposed item in the project; with ids → those + their descendants
  const scope = requested?.length ? withDescendants(all, requested) : new Set(all.filter((x) => x.aiProposed).map((x) => x.id));
  const targets = all.filter((x) => scope.has(x.id) && x.aiProposed);

  const affected: string[] = [];
  if (action === "approve") {
    for (const t of targets) {
      if (!t.aiProposed) continue;
      items.update(t.id, { aiProposed: false, status: t.status === "proposed" ? "writing" : t.status });
      affected.push(t.id);
    }
    if (affected.length) activity.log(id, "item.update", `매니 제안 ${affected.length}개 승인`, { count: affected.length, itemIds: affected.slice(0, 20) });
  } else {
    const done = new Set<string>();
    for (const t of targets) {
      if (done.has(t.id)) continue;
      for (const d of items.remove(t.id)) { done.add(d); affected.push(d); }
    }
    if (affected.length) activity.log(id, "item.delete", `매니 제안 ${affected.length}개 거절`, { count: affected.length, itemIds: affected.slice(0, 20) });
  }

  return ok({ action, affected, items: items.list(id) } satisfies ProposalsResult);
});
