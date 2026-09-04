import { handler, ok, notFound, type Params } from "@/lib/http";
import { projects, items, flows, wireframes, chats } from "@/lib/repo";

/** GET → chats list. GET ?index=1 → compact mention index */
export const GET = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const u = new URL(req.url);
  if (u.searchParams.get("index")) {
    return ok({
      prd: p.prd.sections.map((s) => ({ key: s.key === "custom" ? s.id : s.key, title: s.title })),
      items: items.list(id).map((i) => ({ id: i.id, type: i.type, title: i.title || "(제목 없음)" })),
      flows: flows.list(id).map((f) => ({ id: f.id, name: f.name })),
      wireframes: wireframes.list(id).map((w) => ({ id: w.id, name: w.name })),
    });
  }
  const list = chats.list(id).map((c) => {
    const msgs = chats.messages(c.id);
    return { ...c, messageCount: msgs.length, pendingProposals: msgs.reduce((n, m) => n + m.proposals.filter((x) => x.status === "pending").length, 0) };
  });
  return ok(list);
});

/** POST { title? } → new chat */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  return ok(chats.create(id, body.title || "새 채팅"), { status: 201 });
});
