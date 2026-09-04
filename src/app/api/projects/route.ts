import { handler, ok } from "@/lib/http";
import { projects, activity } from "@/lib/repo";

export const GET = handler(async (req) => {
  const u = new URL(req.url);
  const filter = u.searchParams.get("filter");
  return ok(projects.list({ deleted: filter === "trash", starred: filter === "starred" }));
});

export const POST = handler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { title?: string; description?: string };
  const p = projects.create(body);
  activity.log(p.id, "project.create", p.title);
  return ok(p, { status: 201 });
});
