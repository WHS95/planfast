import { handler, ok, bad } from "@/lib/http";
import { meetings, projects } from "@/lib/repo";

/** GET → meetings with decision counts + project title */
export const GET = handler(async (req) => {
  const u = new URL(req.url);
  const projectId = u.searchParams.get("projectId");
  const list = meetings.list(projectId).map((m) => {
    const ds = meetings.decisions(m.id);
    return {
      ...m,
      projectTitle: m.projectId ? projects.get(m.projectId)?.title ?? null : null,
      counts: { total: ds.length, confirmed: ds.filter((d) => d.status === "confirmed").length, undecided: ds.filter((d) => d.status === "undecided").length, rejected: ds.filter((d) => d.status === "rejected").length, applied: ds.filter((d) => d.applied).length },
    };
  });
  return ok(list);
});

/** POST { title?, projectId?, content?, heldAt? } */
export const POST = handler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { title?: string; projectId?: string | null; content?: string; heldAt?: string };
  if (body.projectId && !projects.get(body.projectId)) return bad("project not found");
  const m = meetings.create({ title: body.title?.trim() || "새 회의록", projectId: body.projectId ?? null, content: body.content, heldAt: body.heldAt });
  return ok(m, { status: 201 });
});
