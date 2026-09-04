import { handler, ok, notFound, type Params } from "@/lib/http";
import { apiKeys } from "@/lib/repo";

export const DELETE = handler(async (_req, { params }: Params<"keyId">) => {
  const { keyId } = await params;
  if (!apiKeys.list().some((k) => k.id === keyId)) return notFound();
  apiKeys.remove(keyId);
  return ok({ ok: true });
});
