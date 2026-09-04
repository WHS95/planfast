import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { reviews } from "@/lib/repo";
import { get } from "@/lib/db";

const STATUSES = ["open", "hold", "resolved"] as const;

/** PATCH { status } */
export const PATCH = handler(async (req, { params }: Params<"id" | "itemId">) => {
  const { id, itemId } = await params;
  const row = get<{ project_id: string }>("SELECT project_id FROM review_items WHERE id=?", itemId);
  if (!row || row.project_id !== id) return notFound();
  const { status } = (await req.json()) as { status?: string };
  if (!status || !(STATUSES as readonly string[]).includes(status)) return bad("invalid status");
  reviews.setItemStatus(itemId, status as (typeof STATUSES)[number]);
  return ok({ ok: true });
});
