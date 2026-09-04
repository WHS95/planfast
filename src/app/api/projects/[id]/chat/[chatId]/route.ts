import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { chats } from "@/lib/repo";

export const GET = handler(async (_req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  return ok({ chat: c, messages: chats.messages(chatId) });
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
