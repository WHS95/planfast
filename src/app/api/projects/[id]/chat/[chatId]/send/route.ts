import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { chats } from "@/lib/repo";
import { prepareManny, type MentionRef } from "@/lib/ai/manny";
import { startChatJob } from "@/lib/ai/jobs";

/**
 * POST { content, mentions?, attachmentIds?, kickoff? } → 201 { user, assistant }
 *
 * 생성을 기다리지 않는다: 사용자 메시지 + 비어 있는 assistant 메시지(status="streaming")를
 * 만들고 백그라운드 잡을 띄운 뒤 즉시 응답한다. 클라이언트는 GET 으로 폴링해서 본문이
 * 채워지는 걸 본다. 요청의 AbortSignal 은 잡에 넘기지 않는다 — 응답이 나가는 순간
 * 자식 프로세스가 죽어버리기 때문.
 */
export const POST = handler(async (req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  const body = (await req.json().catch(() => ({}))) as { content?: string; mentions?: MentionRef[]; attachmentIds?: string[]; kickoff?: "ask" | "files" | null };
  const content = (body.content ?? "").trim();
  if (!content && !body.attachmentIds?.length) return bad("content required");

  // 순서 주의: prepareManny 가 "최근 대화"를 읽고 사용자 메시지를 넣는다. assistant 행은 그 뒤에.
  const prepared = prepareManny({
    projectId: id, chatId, content: content || "첨부 자료를 검토해줘",
    mentions: body.mentions ?? [], attachmentIds: body.attachmentIds ?? [], kickoff: body.kickoff ?? null,
  });
  const assistant = chats.addMessage({ chatId, role: "assistant", content: "", mentions: [], attachments: [], proposals: [], status: "streaming" });
  startChatJob({ projectId: id, chatId, assistantMessageId: assistant.id, system: prepared.system, prompt: prepared.prompt, kickoff: prepared.kickoff });

  return ok({ user: prepared.user, assistant }, { status: 201 });
});
