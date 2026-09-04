import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, comments } from "@/lib/repo";

/** GET ?target=<prefix> → Comment[] */
export const GET = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const target = new URL(req.url).searchParams.get("target") ?? undefined;
  return ok(comments.list(id, target || undefined));
});

/** POST { target, body, x?, y? } → Comment */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { target?: string; body?: string; x?: number | null; y?: number | null };
  const body = b.body?.trim();
  if (!body) return bad("내용을 입력하세요");
  const target = (b.target ?? "project").trim() || "project";
  return ok(comments.create({ projectId: id, target, body, x: b.x ?? null, y: b.y ?? null }), { status: 201 });
});
