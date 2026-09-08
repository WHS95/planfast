import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { meetings, projects } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";

/** POST → extract decisions from meeting content (appends to decisions) */
export const POST = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const m = meetings.get(meetingId);
  if (!m) return notFound();
  if (!m.content.trim()) return bad("회의록 내용이 비어 있습니다");
  const schema = z.object({
    decisions: z.array(z.object({
      text: z.string().describe("결정 사항 한 문장"),
      rationale: z.string().describe("근거/맥락 1~2문장"),
      status: z.enum(["confirmed", "undecided", "rejected"]).describe("confirmed=확정, undecided=미정(추가 논의), rejected=기각"),
    })),
  });
  const ctx = m.projectId && projects.get(m.projectId) ? projectContext(m.projectId, { withIds: false }).text : "";
  const existing = meetings.decisions(meetingId);
  const prompt = [
    `# 회의록: ${m.title} (${m.heldAt.slice(0, 10)})`, m.content,
    ctx ? `# 연결된 프로젝트 기획서 (참고)\n${ctx.slice(0, 20000)}` : "",
    existing.length ? `# 이미 추출된 결정 (중복 금지)\n${existing.map((d) => `- ${d.text}`).join("\n")}` : "",
    "지시: 회의록에서 제품 기획에 영향을 주는 결정 사항을 추출하세요. 확정된 것은 confirmed, 논의만 되고 결론이 없는 것은 undecided, 하지 않기로 한 것은 rejected. 각 결정은 기획서에 반영 가능한 구체적 문장으로. 3~12개.",
  ].filter(Boolean).join("\n\n");
  const r = await generateJson({ task: "meeting.extract", system: MANNY_SYSTEM, prompt, schema });
  const created = r.data.decisions.map((d) => meetings.addDecision({ meetingId, projectId: m.projectId, text: d.text, rationale: d.rationale, status: d.status }));
  return ok({ decisions: meetings.decisions(meetingId), created: created.length });
});
