import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { wireframes } from "@/lib/repo";
import { startGeneration, isRunning, type GenerateMode } from "@/lib/wireframe/generator";

/** POST { mode: "continue"|"all"|"page", pageId?, request? } */
export const POST = handler(async (req, { params }: Params<"id" | "wfId">) => {
  const { id, wfId } = await params;
  const wf = wireframes.get(wfId);
  if (!wf || wf.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as { mode?: GenerateMode; pageId?: string; request?: string };
  const mode: GenerateMode = body.mode === "all" || body.mode === "page" ? body.mode : "continue";
  if (mode === "page" && !body.pageId) return bad("pageId required");
  const r = startGeneration(wfId, { mode, pageId: body.pageId, request: body.request?.trim() || undefined });
  if (!r.started) return bad(r.reason ?? "cannot start", isRunning(wfId) ? 409 : 400);
  return ok({ ...wf, running: true, pages: wireframes.pages(wfId) }, { status: 202 });
});
