import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, shareLinks, activity } from "@/lib/repo";

/** GET → ShareLink[] */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(shareLinks.list(id));
});

/** POST { expiresInDays?: number|null, expiresAt?: string|null } → ShareLink */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const b = (await req.json().catch(() => ({}))) as { expiresInDays?: number | null; expiresAt?: string | null };
  let expiresAt: string | null = null;
  if (typeof b.expiresAt === "string" && b.expiresAt) {
    const d = new Date(b.expiresAt);
    if (Number.isNaN(d.getTime())) return bad("잘못된 날짜");
    if (d.getTime() < Date.now()) return bad("만료일은 미래여야 합니다");
    expiresAt = d.toISOString();
  } else if (typeof b.expiresInDays === "number" && b.expiresInDays > 0) {
    expiresAt = new Date(Date.now() + b.expiresInDays * 86400_000).toISOString();
  }
  const l = shareLinks.create(id, expiresAt);
  activity.log(id, "share.create", expiresAt ? `만료 ${expiresAt.slice(0, 10)}` : "무기한", { linkId: l.id });
  return ok(l, { status: 201 });
});
