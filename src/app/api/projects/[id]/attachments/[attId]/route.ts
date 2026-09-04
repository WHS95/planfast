import { handler, ok, notFound, type Params } from "@/lib/http";
import { attachments, activity } from "@/lib/repo";

export const GET = handler(async (_req, { params }: Params<"id" | "attId">) => {
  const { id, attId } = await params;
  const a = attachments.get(attId);
  return a && a.projectId === id ? ok(a) : notFound();
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "attId">) => {
  const { id, attId } = await params;
  const a = attachments.get(attId);
  if (!a || a.projectId !== id) return notFound();
  attachments.remove(attId);
  activity.log(id, "attachment.remove", a.name);
  return ok({ ok: true });
});
