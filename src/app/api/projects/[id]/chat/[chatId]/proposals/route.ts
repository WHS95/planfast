import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { chats } from "@/lib/repo";
import { applyProposal, rejectProposal } from "@/lib/ai/manny";

/** POST { messageId, proposalId?, action: "apply"|"reject"|"applyAll" } → updated message */
export const POST = handler(async (req, { params }: Params<"id" | "chatId">) => {
  const { id, chatId } = await params;
  const c = chats.get(chatId);
  if (!c || c.projectId !== id) return notFound();
  const { messageId, proposalId, action } = (await req.json()) as { messageId: string; proposalId?: string; action: "apply" | "reject" | "applyAll" };
  let msg = chats.messages(chatId).find((m) => m.id === messageId);
  if (!msg) return notFound("message not found");
  const errors: string[] = [];
  if (action === "applyAll") {
    for (const p of msg.proposals) {
      if (p.status !== "pending") continue;
      try { msg = applyProposal(id, msg, p.id); } catch (e) { errors.push(`${p.summary}: ${(e as Error).message}`); }
    }
  } else if (action === "apply") {
    if (!proposalId) return bad("proposalId required");
    try { msg = applyProposal(id, msg, proposalId); } catch (e) { return bad((e as Error).message); }
  } else if (action === "reject") {
    if (!proposalId) return bad("proposalId required");
    msg = rejectProposal(msg, proposalId);
  } else return bad("unknown action");
  return ok({ message: msg, errors });
});
