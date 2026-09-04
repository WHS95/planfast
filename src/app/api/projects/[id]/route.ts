import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, activity, versions } from "@/lib/repo";

export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  return p ? ok(p) : notFound();
});

export const PATCH = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("잘못된 요청 본문입니다.");
  const { action, ...patch } = body as { action?: string } & Record<string, unknown>;
  if ("prd" in patch && (patch.prd === null || patch.prd === undefined)) delete patch.prd;
  if ("settings" in patch && (patch.settings === null || patch.settings === undefined)) delete patch.settings;
  if (action === "duplicate") { const c = projects.duplicate(id); return c ? ok(c) : notFound(); }
  if (action === "trash") { projects.softDelete(id); return ok({ ok: true }); }
  if (action === "restore") { projects.restore(id); return ok({ ok: true }); }
  if (action === "snapshot") { return ok(versions.create(id, (patch.name as string) || "자동 저장", true)); }
  const p = projects.update(id, patch);
  if (!p) return notFound();
  if (patch.prd) activity.log(id, "prd.update", "PRD");
  else if (patch.title) activity.log(id, "project.rename", patch.title as string);
  return ok(p);
});

export const DELETE = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  projects.hardDelete(id);
  return ok({ ok: true });
});
