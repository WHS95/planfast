import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { pages, activity } from "@/lib/repo";
import type { PageMeta } from "@/lib/types";

const META_TEXT_KEYS = ["type", "directory", "fileName", "adminFn", "relatedPages"] as const;

/** 알 수 없는 키가 meta 에 섞여 들어오지 않게 화이트리스트로 거른다. */
function readMeta(raw: unknown): PageMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const meta: PageMeta = {};
  if (typeof src.x === "number" && Number.isFinite(src.x)) meta.x = src.x;
  if (typeof src.y === "number" && Number.isFinite(src.y)) meta.y = src.y;
  // null 이면 "좌표 삭제(자동배치로 되돌리기)" 신호 → undefined 로 두면 병합에서 무시되므로 NaN 대신 명시적으로 지움
  for (const k of META_TEXT_KEYS) if (typeof src[k] === "string") meta[k] = src[k] as string;
  return Object.keys(meta).length ? meta : undefined;
}

/** PATCH { name?, description?, parentId?, order?, linkedSpecIds?, meta? } */
export const PATCH = handler(async (req, { params }: Params<"id" | "pageId">) => {
  const { id, pageId } = await params;
  const cur = pages.get(pageId);
  if (!cur || cur.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof pages.update>[1] = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.description === "string") patch.description = body.description;
  if (Array.isArray(body.linkedSpecIds)) patch.linkedSpecIds = body.linkedSpecIds.filter((x): x is string => typeof x === "string");
  if (typeof body.order === "number") patch.order = body.order;
  const meta = readMeta(body.meta);
  if (meta) patch.meta = meta;
  if ("parentId" in body) {
    const parentId = (body.parentId as string | null) ?? null;
    if (parentId) {
      if (parentId === pageId) return bad("cannot parent to self");
      const target = pages.get(parentId);
      if (!target || target.projectId !== id) return bad("invalid parentId");
      // prevent cycles: target must not be a descendant of this page
      const all = pages.list(id);
      let cursor: string | null = parentId;
      while (cursor) { if (cursor === pageId) return bad("cannot move under own descendant"); cursor = all.find((p) => p.id === cursor)?.parentId ?? null; }
    }
    patch.parentId = parentId;
    if (patch.order === undefined && parentId !== cur.parentId) {
      const sib = pages.list(id).filter((p) => p.parentId === parentId && p.id !== pageId);
      patch.order = sib.length ? Math.max(...sib.map((p) => p.order)) + 1 : 0;
    }
  }
  const p = pages.update(pageId, patch);
  // 캔버스 드래그(좌표만 저장)는 활동 로그를 채우지 않는다 — 의미 있는 편집만 남긴다.
  const positionOnly = Object.keys(patch).length === 1 && !!meta && Object.keys(meta).every((k) => k === "x" || k === "y");
  if (!positionOnly) activity.log(id, "page.update", p?.name ?? cur.name);
  return ok(p);
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "pageId">) => {
  const { id, pageId } = await params;
  const cur = pages.get(pageId);
  if (!cur || cur.projectId !== id) return notFound();
  pages.remove(pageId);
  activity.log(id, "page.delete", cur.name);
  return ok({ ok: true });
});
