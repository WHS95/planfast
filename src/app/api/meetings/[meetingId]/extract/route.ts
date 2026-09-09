import { z } from "zod";
import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { meetings, projects } from "@/lib/repo";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext } from "@/lib/ai/context";
import type { Meeting } from "@/lib/types";

export const decisionSchema = z.object({
  text: z.string().describe("결정 사항 한 문장"),
  rationale: z.string().describe("근거/맥락 1~2문장"),
  status: z.enum(["confirmed", "undecided", "rejected"]).describe("confirmed=확정, undecided=미정(추가 논의), rejected=기각"),
});
export const decisionsSchema = z.object({ decisions: z.array(decisionSchema) });

/** 회의록 검증 + 프롬프트 조립. 일반/스트리밍 라우트가 같이 쓴다. */
type PlanError = { error: string; status: 400 | 404 };
export function planExtract(meetingId: string): PlanError | { m: Meeting; prompt: string } {
  const m = meetings.get(meetingId);
  if (!m) return { error: "meeting not found", status: 404 };
  if (!m.content.trim()) return { error: "회의록 내용이 비어 있습니다", status: 400 };
  const ctx = m.projectId && projects.get(m.projectId) ? projectContext(m.projectId, { withIds: false }).text : "";
  const existing = meetings.decisions(meetingId);
  const prompt = [
    `# 회의록: ${m.title} (${m.heldAt.slice(0, 10)})`, m.content,
    ctx ? `# 연결된 프로젝트 기획서 (참고)\n${ctx.slice(0, 20000)}` : "",
    existing.length ? `# 이미 추출된 결정 (중복 금지)\n${existing.map((d) => `- ${d.text}`).join("\n")}` : "",
    "지시: 회의록에서 제품 기획에 영향을 주는 결정 사항을 추출하세요. 확정된 것은 confirmed, 논의만 되고 결론이 없는 것은 undecided, 하지 않기로 한 것은 rejected. 각 결정은 기획서에 반영 가능한 구체적 문장으로. 3~12개. 각 객체는 text 를 먼저 쓰세요.",
  ].filter(Boolean).join("\n\n");
  return { m, prompt };
}

/** POST → extract decisions from meeting content (appends to decisions)  — 한 번에(MCP·스크립트용) */
export const POST = handler(async (_req, { params }: Params<"meetingId">) => {
  const { meetingId } = await params;
  const plan = planExtract(meetingId);
  if ("error" in plan) return plan.status === 404 ? notFound() : bad(plan.error);
  const r = await generateJson({ task: "meeting.extract", system: MANNY_SYSTEM, prompt: plan.prompt, schema: decisionsSchema });
  const created = r.data.decisions.map((d) => meetings.addDecision({ meetingId, projectId: plan.m.projectId, text: d.text, rationale: d.rationale, status: d.status }));
  return ok({ decisions: meetings.decisions(meetingId), created: created.length });
});
