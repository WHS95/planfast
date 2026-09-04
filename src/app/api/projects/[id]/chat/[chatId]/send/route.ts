import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { chats } from "@/lib/repo";
import { runManny, type MentionRef } from "@/lib/ai/manny";

/** POST { content, mentions?, attachmentIds?, kickoff? } → { user, assistant } */
export const POST = handler(async (req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as { content?: string; mentions?: MentionRef[]; attachmentIds?: string[]; kickoff?: "ask" | "files" | null };
  const content = (body.content ?? "").trim();
  if (!content && !body.attachmentIds?.length) return bad("content required");
  const r = await runManny({ projectId: id, chatId, content: content || "첨부 자료를 검토해줘", mentions: body.mentions ?? [], attachmentIds: body.attachmentIds ?? [], kickoff: body.kickoff ?? null });
  return ok(r);
});
