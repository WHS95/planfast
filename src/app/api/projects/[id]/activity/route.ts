import { handler, ok, notFound, type Params } from "@/lib/http";
import { projects, activity } from "@/lib/repo";

/** GET ?limit=200 → Activity[] newest first */
export const GET = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const limit = Math.min(1000, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 200) || 200));
  return ok(activity.list(id, limit));
});
