import { handler, ok, notFound, type Params } from "@/lib/http";
import { shareLinks, activity } from "@/lib/repo";

/** PATCH { disabled } → ShareLink */
export const PATCH = handler(async (req, { params }: Params<"id" | "linkId">) => {
  const { id, linkId } = await params;
  const l = shareLinks.get(linkId);
  if (!l || l.projectId !== id) return notFound();
  const b = (await req.json().catch(() => ({}))) as { disabled?: boolean };
  if (typeof b.disabled === "boolean") {
    shareLinks.setDisabled(linkId, b.disabled);
    activity.log(id, b.disabled ? "share.disable" : "share.enable", linkId.slice(0, 6));
  }
  return ok(shareLinks.get(linkId));
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "linkId">) => {
  const { id, linkId } = await params;
  const l = shareLinks.get(linkId);
  if (!l || l.projectId !== id) return notFound();
  shareLinks.remove(linkId);
  activity.log(id, "share.delete", linkId.slice(0, 6));
  return ok({ ok: true });
});
