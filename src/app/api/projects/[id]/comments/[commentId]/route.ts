import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { comments } from "@/lib/repo";

function find(id: string, commentId: string) {
  return comments.list(id).find((c) => c.id === commentId);
}

/** PATCH { body?, resolved?, x?, y? } → Comment */
export const PATCH = handler(async (req, { params }: Params<"id" | "commentId">) => {
  const { id, commentId } = await params;
  if (!find(id, commentId)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { body?: string; resolved?: boolean; x?: number | null; y?: number | null };
  const patch: Parameters<typeof comments.update>[1] = {};
  if (typeof b.body === "string") { if (!b.body.trim()) return bad("내용을 입력하세요"); patch.body = b.body.trim(); }
  if (typeof b.resolved === "boolean") patch.resolved = b.resolved;
  if (b.x !== undefined) patch.x = b.x;
  if (b.y !== undefined) patch.y = b.y;
  return ok(comments.update(commentId, patch));
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "commentId">) => {
  const { id, commentId } = await params;
  if (!find(id, commentId)) return notFound();
  comments.remove(commentId);
  return ok({ ok: true });
});
