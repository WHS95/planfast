import { handler, ok, notFound, type Params } from "@/lib/http";
import { projects, versions, activity } from "@/lib/repo";

/** GET → Version incl. snapshot + counts */
export const GET = handler(async (_req, { params }: Params<"id" | "versionId">) => {
  const { id, versionId } = await params;
  const v = versions.get(versionId);
  if (!v || v.projectId !== id) return notFound();
  const snap = v.snapshot;
  return ok({ ...v, counts: { items: snap.items?.length ?? 0, pages: snap.pages?.length ?? 0, flows: snap.flows?.length ?? 0 } });
});

/** POST → restore this version (creates a safety auto version first) */
export const POST = handler(async (_req, { params }: Params<"id" | "versionId">) => {
  const { id, versionId } = await params;
  if (!projects.get(id)) return notFound();
  const v = versions.get(versionId);
  if (!v || v.projectId !== id) return notFound();
  versions.restore(versionId);
  activity.log(id, "version.restore", v.name, { versionId });
  return ok({ ok: true });
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "versionId">) => {
  const { id, versionId } = await params;
  const v = versions.get(versionId);
  if (!v || v.projectId !== id) return notFound();
  versions.remove(versionId);
  activity.log(id, "version.delete", v.name, { versionId });
  return ok({ ok: true });
});
