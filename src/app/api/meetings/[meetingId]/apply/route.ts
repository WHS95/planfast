import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { meetings, projects, chats, activity } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import { proposalOpSchema, normalizeOp } from "@/lib/ai/manny";
import { rid, type Proposal } from "@/lib/types";

/** POST → generate ProposalOps for confirmed & unapplied decisions → new chat in project */
export const POST = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const m = meetings.get(meetingId);
  if (!m) return notFound();
  if (!m.projectId || !projects.get(m.projectId)) return bad("프로젝트가 연결되어 있지 않습니다");
  const targets = meetings.decisions(meetingId).filter((d) => d.status === "confirmed" && !d.applied);
  if (!targets.length) return bad("반영할 확정 결정이 없습니다");

  const { project, text } = projectContext(m.projectId, { withIds: true });
  const schema = z.object({
    summary: z.string().describe("반영 요약 (사용자에게 보여줄 답변)"),
    proposals: z.array(z.object({ summary: z.string(), op: proposalOpSchema })),
  });
  const prompt = [
    text,
    "# PRD 섹션 키와 항목명", ...project.prd.sections.map((s) => `- ${s.key === "custom" ? s.title : s.key} (${s.title}): ${s.fields.map((f) => f.label).join(" / ")}`),
    `# 회의 결정 사항 (${m.title}, ${m.heldAt.slice(0, 10)})`,
    ...targets.map((d, i) => `${i + 1}. ${d.text}${d.rationale ? `\n   근거: ${d.rationale}` : ""}`),
    "지시: 위 결정 사항을 기획서에 반영하기 위한 변경 제안을 만드세요. PRD 수정은 prd.set(sectionKey+label 정확히), 항목 추가는 item.create(요구사항 parentId=null, 기능은 요구사항 id, 상세기능은 기능 id; 같은 응답 안의 새 항목은 tempId로 참조), 기존 항목 수정은 item.update(문맥의 [id]), 삭제는 item.delete. 각 결정이 최소 하나의 제안으로 이어지도록. summary에는 어떤 결정을 어떻게 반영했는지 요약.",
  ].join("\n\n");
  const r = await generateJson({ system: MANNY_SYSTEM, prompt, schema });
  const proposals: Proposal[] = r.data.proposals.map((p) => ({ id: rid(), summary: p.summary, op: normalizeOp(p.op), status: "pending" }));
  const chat = chats.create(m.projectId, `회의 결정 반영 (${m.heldAt.slice(0, 10)})`);
  chats.addMessage({ chatId: chat.id, role: "user", content: `회의록 "${m.title}"의 확정 결정 ${targets.length}건을 기획서에 반영해줘.\n${targets.map((d) => `- ${d.text}`).join("\n")}`, mentions: [], attachments: [], proposals: [] });
  const assistant = chats.addMessage({ chatId: chat.id, role: "assistant", content: r.data.summary, mentions: [], attachments: [], proposals });
  for (const d of targets) meetings.updateDecision(d.id, { applied: true });
  activity.log(m.projectId, "meeting.apply", m.title, { decisions: targets.length, proposals: proposals.length }, "manny");
  return ok({ chatId: chat.id, projectId: m.projectId, messageId: assistant.id, proposals: proposals.length, url: `/p/${m.projectId}/prd?chat=${chat.id}` });
});
