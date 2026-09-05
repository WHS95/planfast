import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { chats } from "@/lib/repo";
import { reapStale } from "@/lib/ai/jobs";

export const GET = handler(async (_req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  // 서버 재시작으로 "streaming" 인 채 남은 유령 메시지는 여기서 error 로 정리된다
  return ok({ chat: c, messages: reapStale(chats.messages(chatId)) });
});

export const PATCH = handler(async (req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  const { title } = (await req.json()) as { title?: string };
  if (!title?.trim()) return bad("title required");
  chats.rename(chatId, title.trim());
  return ok(chats.get(chatId));
});

export const DELETE = handler(async (_req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  chats.remove(chatId);
  return ok({ ok: true });
});
