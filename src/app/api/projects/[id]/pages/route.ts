import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, pages, items, activity } from "@/lib/repo";

/** GET → Page[]  |  GET ?withSpecs=1 → { pages, specs: {id,title,featureTitle}[] } */
export const GET = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const list = pages.list(id);
  const url = new URL(req.url);
  if (!url.searchParams.get("withSpecs")) return ok(list);
  const all = items.list(id);
  const specs = all.filter((i) => i.type === "spec").map((s) => ({ id: s.id, title: s.title, featureTitle: all.find((f) => f.id === s.parentId)?.title ?? "" }));
  return ok({ pages: list, specs });
});

/** POST { name, description?, parentId?, linkedSpecIds? } → Page  |  POST { bulk: [{name, description, parentId?, children?}] } → Page[] */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (Array.isArray(body.bulk)) {
    type In = { name: string; description?: string; parentId?: string | null; children?: In[] };
    const created: ReturnType<typeof pages.create>[] = [];
    const walk = (list: In[], parentId: string | null) => {
      for (const n of list) {
        if (!n.name?.trim()) continue;
        const p = pages.create({ projectId: id, parentId, name: n.name.trim(), description: n.description ?? "" });
        created.push(p);
        if (n.children?.length) walk(n.children, p.id);
      }
    };
    walk(body.bulk as In[], (body.parentId as string | null) ?? null);
    activity.log(id, "page.create", `${created.length}개 페이지`, { count: created.length });
    return ok(created, { status: 201 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return bad("name required");
  const parentId = (body.parentId as string | null) ?? null;
  if (parentId && pages.get(parentId)?.projectId !== id) return bad("invalid parentId");
  const p = pages.create({ projectId: id, parentId, name, description: (body.description as string) ?? "", linkedSpecIds: (body.linkedSpecIds as string[]) ?? [] });
  activity.log(id, "page.create", p.name);
  return ok(p, { status: 201 });
});
