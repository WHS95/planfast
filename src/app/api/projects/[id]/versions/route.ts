import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, versions, activity } from "@/lib/repo";

/** GET → Version[] (without snapshot) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(versions.list(id));
});

/** POST { name } → Version (manual save) */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() || `수동 저장 ${new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`;
  if (name.length > 120) return bad("이름이 너무 깁니다");
  const v = versions.create(id, name, false);
  activity.log(id, "version.create", name, { versionId: v.id });
  const { snapshot: _s, ...rest } = v; void _s;
  return ok(rest, { status: 201 });
});
