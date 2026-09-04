/**
 * 매니 채팅 오케스트레이션 (server only).
 *  - 프롬프트 조립(프로젝트 컨텍스트 + 멘션 + 첨부 + 최근 대화)
 *  - generateJson → { reply, proposals[] }
 *  - 제안(ProposalOp) 반영: prd.set / item.create / item.update / item.delete
 */
import { z } from "zod";
import { generateJson } from "@/lib/ai";
import { MANNY_SYSTEM, projectContext, prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { projects, items, flows, wireframes, chats, attachments, activity } from "@/lib/repo";
import {
  rid, ITEM_TYPES, PRIORITIES, STATUSES, SPEC_SLOTS, PRD_SECTION_KEYS,
  type ChatMessage, type Proposal, type ProposalOp, type Item, type Prd, type PrdSection, type RequirementData, type FeatureData, type SpecData, type Attachment,
} from "@/lib/types";

export const ATTACHMENT_PROMPT_CAP = 30_000;
export const HISTORY_LIMIT = 20;

// ---------------------------------------------------------------- schema
const itemDataSchema = z.object({
  acceptance: z.array(z.string()).optional().describe("요구사항 수용 기준 목록"),
  roles: z.array(z.string()).optional().describe("기능: 사용자 역할"),
  rationale: z.string().optional().describe("기능: 근거"),
  successCriteria: z.string().optional().describe("기능: 성공 기준"),
  slots: z.record(z.enum(SPEC_SLOTS), z.string()).optional().describe("상세기능: 개발 준비 슬롯"),
});

export const proposalOpSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("prd.set"),
    sectionKey: z.string().describe("PRD 섹션 키(overview/problem/target/success/attributes) 또는 섹션 제목"),
    label: z.string().describe("항목명 (기존 항목명과 정확히 일치시키거나 새 항목명)"),
    content: z.string().describe("항목 내용. 속성 설정 섹션은 쉼표로 구분된 키워드"),
  }),
  z.object({
    kind: z.literal("item.create"),
    tempId: z.string().describe("이 메시지 안에서 참조용 임시 id (예: t1)"),
    type: z.enum(ITEM_TYPES),
    parentId: z.string().nullable().describe("상위 항목 id 또는 같은 메시지의 tempId. 요구사항은 null"),
    title: z.string(),
    description: z.string(),
    data: itemDataSchema.optional(),
  }),
  z.object({
    kind: z.literal("item.update"),
    itemId: z.string(),
    patch: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(STATUSES).optional(),
      data: itemDataSchema.optional(),
    }),
  }),
  z.object({ kind: z.literal("item.delete"), itemId: z.string() }),
]);
export type ProposalOpInput = z.infer<typeof proposalOpSchema>;

export const mannyReplySchema = z.object({
  reply: z.string().describe("사용자에게 보여줄 답변 (마크다운 간단 문법: 문단, - 불릿, **굵게**)"),
  proposals: z.array(z.object({ summary: z.string().describe("제안 한 줄 요약"), op: proposalOpSchema })),
});

/** zod 스키마의 느슨한 입력을 ProposalOp 도메인 타입으로 정규화 */
export function normalizeOp(op: ProposalOpInput): ProposalOp {
  const conv = (d?: z.infer<typeof itemDataSchema>) => {
    if (!d) return undefined;
    const out: Record<string, unknown> = {};
    if (d.acceptance) out.acceptance = d.acceptance.map((text) => ({ id: rid(), text, done: false }));
    if (d.roles) out.roles = d.roles;
    if (d.rationale !== undefined) out.rationale = d.rationale;
    if (d.successCriteria !== undefined) out.successCriteria = d.successCriteria;
    if (d.slots) out.slots = d.slots;
    return Object.keys(out).length ? out : undefined;
  };
  if (op.kind === "item.create") return { ...op, data: conv(op.data) as Extract<ProposalOp, { kind: "item.create" }>["data"] };
  if (op.kind === "item.update") return { kind: "item.update", itemId: op.itemId, patch: { ...op.patch, data: conv(op.patch.data) } };
  return op;
}

// ---------------------------------------------------------------- prompt
export interface MentionRef { type: "prd" | "item" | "flow" | "wireframe"; id: string; label: string }

const PROPOSAL_RULES = `
# 제안(proposals) 작성 규칙
- 문서를 바꾸는 요청이면 답변(reply)에 설명을 쓰고, 실제 변경은 proposals 배열에 담습니다. 절대 reply 안에 "반영했습니다"라고 쓰지 마세요. 사용자가 반영/거절을 선택합니다.
- 단순 질문·상담이면 proposals는 빈 배열입니다.
- prd.set: sectionKey는 섹션 키(overview/problem/target/success/attributes) 또는 섹션 제목, label은 기존 항목명과 정확히 일치. 새 항목이 필요하면 새 label을 사용.
- item.create: 요구사항(requirement, parentId=null) → 기능(feature, parentId=요구사항 id) → 상세기능(spec, parentId=기능 id). 같은 메시지에서 만든 항목은 tempId로 참조.
- item.update: 기존 항목의 id(문맥의 [id])만 사용. patch에는 바꾸는 필드만.
- item.delete: 신중히. 근거를 reply에 명시.
- summary는 한국어 한 줄. 제안은 많아도 15개 이내로.
- PRD가 대부분 비어 있고 사용자가 아이디어·배경·답변을 제공했다면 prd.set 제안으로 PRD 초안을 채웁니다.`;

function prdKeyGuide(prd: Prd): string {
  const lines = ["# PRD 섹션 키와 항목명"];
  for (const s of prd.sections) lines.push(`- ${s.key === "custom" ? s.title : s.key} (${s.title}): ${s.fields.map((f) => f.label).join(" / ")}`);
  return lines.join("\n");
}

function mentionDetail(projectId: string, m: MentionRef): string {
  const p = projects.get(projectId);
  if (!p) return "";
  if (m.type === "prd") {
    const sec = p.prd.sections.find((s) => s.key === m.id || s.id === m.id || s.title === m.id);
    return sec ? prdToMarkdown({ sections: [sec] }) : `(PRD 섹션 ${m.label})`;
  }
  if (m.type === "item") {
    const all = items.list(projectId);
    const root = all.find((i) => i.id === m.id);
    if (!root) return `(항목 ${m.label} — 존재하지 않음)`;
    const keep = new Set<string>([root.id]);
    let ch = true;
    while (ch) { ch = false; for (const it of all) if (it.parentId && keep.has(it.parentId) && !keep.has(it.id)) { keep.add(it.id); ch = true; } }
    // ancestors for context
    let cur: Item | undefined = root;
    while (cur?.parentId) { cur = all.find((i) => i.id === cur!.parentId); if (cur) keep.add(cur.id); }
    return itemsToMarkdown(all.filter((i) => keep.has(i.id)), { withIds: true });
  }
  if (m.type === "flow") {
    const f = flows.get(m.id);
    if (!f) return `(유저플로우 ${m.label})`;
    return [`유저플로우: ${f.name}`, ...f.nodes.map((n) => `- [${n.type}] ${n.label}${n.description ? `: ${n.description}` : ""}`),
      ...f.edges.map((e) => `- ${f.nodes.find((n) => n.id === e.source)?.label} → ${f.nodes.find((n) => n.id === e.target)?.label}${e.label ? ` (${e.label})` : ""}`)].join("\n");
  }
  const w = wireframes.get(m.id);
  if (!w) return `(와이어프레임 ${m.label})`;
  return [`와이어프레임: ${w.name} (${w.device})`, ...wireframes.pages(w.id).map((pg) => `- 화면: ${pg.name}`)].join("\n");
}

export function attachmentsBlock(atts: Attachment[], cap = ATTACHMENT_PROMPT_CAP): string {
  if (!atts.length) return "";
  let budget = cap;
  const parts: string[] = [];
  for (const a of atts) {
    const t = a.text.slice(0, Math.max(0, budget));
    budget -= t.length;
    parts.push(`--- 첨부: ${a.name} ---\n${t}${t.length < a.text.length ? "\n…(생략)" : ""}`);
    if (budget <= 0) break;
  }
  return parts.join("\n\n");
}

export interface BuildPromptInput {
  projectId: string;
  chatId: string;
  content: string;
  mentions: MentionRef[];
  attachments: Attachment[];
  /** 킥오프 모드: ask=인사+질문, files=첨부 기반 PRD 초안 */
  kickoff?: "ask" | "files" | null;
}

export function buildMannyPrompt(input: BuildPromptInput): { system: string; prompt: string } {
  const { project, text } = projectContext(input.projectId, { withIds: true, includeFlows: true, includePages: true });
  const history = chats.messages(input.chatId).slice(-HISTORY_LIMIT);
  const parts: string[] = [];
  parts.push(text, prdKeyGuide(project.prd));
  if (input.mentions.length) {
    parts.push("# 사용자가 지목한 대상 (이 대상을 중심으로 답하세요)", ...input.mentions.map((m) => `## @${m.label}\n${mentionDetail(input.projectId, m)}`));
  }
  const ab = attachmentsBlock(input.attachments);
  if (ab) parts.push("# 첨부 자료", ab);
  if (history.length) {
    parts.push("# 최근 대화", ...history.map((m) => {
      const props = m.proposals.length ? `\n(제안 ${m.proposals.length}건: ${m.proposals.map((p) => `${p.summary}[${p.status}]`).join("; ")})` : "";
      return `${m.role === "user" ? "사용자" : "매니"}: ${m.content}${props}`;
    }));
  }
  if (input.kickoff === "ask") {
    parts.push("# 이번 턴", `사용자가 새 프로젝트를 시작하며 아래 아이디어를 적었습니다.\n"""\n${input.content}\n"""`,
      "지시: 짧게 인사하고, 이 아이디어를 PRD로 구체화하기 위해 꼭 필요한 명확화 질문 3~5개를 번호 목록으로 하세요. 각 질문은 한 문장, 필요하면 예시 선택지를 괄호로. 이번 턴에는 proposals를 만들지 마세요(빈 배열).");
  } else if (input.kickoff === "files") {
    parts.push("# 이번 턴", `사용자 요청: ${input.content}`,
      "지시: 첨부 자료(및 프로젝트 설명)를 근거로 PRD 초안을 prd.set 제안으로 채우세요. 개요/문제/타겟/성공 섹션의 기존 항목명을 모두 채우고, 속성 설정은 쉼표 구분 키워드로. reply에는 자료에서 파악한 핵심과 확인이 필요한 점을 간단히.");
  } else {
    parts.push("# 이번 턴", `사용자: ${input.content}`, "지시: 위 컨텍스트를 바탕으로 답하세요. 문서 변경이 필요하면 proposals로 제안하세요.");
  }
  const system = [MANNY_SYSTEM, PROPOSAL_RULES, project.settings.chatTone ? `채팅 말투: ${project.settings.chatTone}` : ""].filter(Boolean).join("\n\n");
  return { system, prompt: parts.join("\n\n") };
}

// ---------------------------------------------------------------- run
export interface SendInput {
  projectId: string;
  chatId: string;
  content: string;
  mentions?: MentionRef[];
  attachmentIds?: string[];
  kickoff?: "ask" | "files" | null;
}

export async function runManny(input: SendInput): Promise<{ user: ChatMessage | null; assistant: ChatMessage }> {
  const mentions = input.mentions ?? [];
  let atts = (input.attachmentIds ?? []).map((id) => attachments.get(id)).filter((a): a is NonNullable<typeof a> => !!a && a.projectId === input.projectId);
  if (input.kickoff === "files" && !atts.length) atts = attachments.list(input.projectId);
  const { system, prompt } = buildMannyPrompt({ projectId: input.projectId, chatId: input.chatId, content: input.content, mentions, attachments: atts, kickoff: input.kickoff });

  // hidden first turn for kickoff=ask: do not persist the user message
  const user = input.kickoff === "ask" ? null : chats.addMessage({
    chatId: input.chatId, role: "user", content: input.content, mentions,
    attachments: atts.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, text: "" })), proposals: [],
  });

  let reply = "";
  let proposals: Proposal[] = [];
  try {
    const r = await generateJson({ system, prompt, schema: mannyReplySchema });
    reply = r.data.reply;
    proposals = r.data.proposals.map((p) => ({ id: rid(), summary: p.summary, op: normalizeOp(p.op), status: "pending" as const }));
  } catch (e) {
    reply = `죄송해요, 응답 생성 중 문제가 생겼어요. 다시 시도해 주세요.\n\n오류: ${(e as Error).message.slice(0, 300)}`;
  }
  const assistant = chats.addMessage({ chatId: input.chatId, role: "assistant", content: reply, mentions: [], attachments: [], proposals });

  // auto-title the chat on first user message
  const chat = chats.get(input.chatId);
  if (chat && (chat.title === "새 채팅" || !chat.title)) chats.rename(input.chatId, input.content.replace(/\s+/g, " ").trim().slice(0, 40) || "새 채팅");
  activity.log(input.projectId, "chat.send", chat?.title ?? "채팅", { proposals: proposals.length }, "manny");
  return { user, assistant };
}

// ---------------------------------------------------------------- apply
function findSection(prd: Prd, key: string): PrdSection | undefined {
  const k = key.trim().toLowerCase();
  return prd.sections.find((s) => s.key === k) ?? prd.sections.find((s) => s.title.trim().toLowerCase() === k) ?? prd.sections.find((s) => s.id === key);
}

const SECTION_TITLE: Record<string, string> = { overview: "개요", problem: "문제 및 해결 방안", target: "타겟 및 시나리오", success: "성공·위험 요소", attributes: "속성 설정" };

export function applyPrdSet(projectId: string, op: Extract<ProposalOp, { kind: "prd.set" }>): string {
  const p = projects.get(projectId);
  if (!p) throw new Error("project not found");
  const prd: Prd = { sections: p.prd.sections.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f })) })) };
  let sec = findSection(prd, op.sectionKey);
  if (!sec) {
    const isKnown = (PRD_SECTION_KEYS as readonly string[]).includes(op.sectionKey);
    sec = { id: rid(), key: isKnown ? (op.sectionKey as PrdSection["key"]) : "custom", title: SECTION_TITLE[op.sectionKey] ?? op.sectionKey, fields: [] };
    prd.sections.push(sec);
  }
  const lab = op.label.trim().toLowerCase();
  let field = sec.fields.find((f) => f.label.trim().toLowerCase() === lab);
  if (!field) {
    field = { id: rid(), label: op.label.trim(), content: "" };
    if (sec.key === "attributes") field.values = [];
    sec.fields.push(field);
  }
  if (field.values) field.values = op.content.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  else field.content = op.content;
  projects.update(projectId, { prd });
  return `${sec.title} · ${field.label}`;
}

/** 메시지 내 제안을 반영. tempId 의존(부모 생성)이 pending이면 먼저 반영. 반환: 갱신된 메시지 */
export function applyProposal(projectId: string, message: ChatMessage, proposalId: string): ChatMessage {
  const proposals = message.proposals.map((p) => ({ ...p }));
  const byTemp = new Map<string, Proposal>();
  for (const p of proposals) if (p.op.kind === "item.create") byTemp.set(p.op.tempId, p);
  const resolve = (ref: string | null): string | null => {
    if (!ref) return null;
    if (items.get(ref)) return ref;
    const dep = byTemp.get(ref);
    if (!dep) return null;
    if (dep.status !== "accepted") applyOne(dep);
    return dep.resultId ?? null;
  };
  function applyOne(p: Proposal) {
    if (p.status === "accepted") return;
    const op = p.op;
    if (op.kind === "prd.set") {
      const t = applyPrdSet(projectId, op);
      activity.log(projectId, "prd.update", t, { summary: p.summary }, "manny");
    } else if (op.kind === "item.create") {
      const parentId = resolve(op.parentId);
      const it = items.create({ projectId, type: op.type, parentId, title: op.title, description: op.description, data: op.data as Partial<Item["data"]> | undefined });
      p.resultId = it.id;
      activity.log(projectId, "item.create", it.title, { id: it.id, type: it.type, summary: p.summary }, "manny");
    } else if (op.kind === "item.update") {
      const id = resolve(op.itemId);
      if (!id) throw new Error(`항목을 찾을 수 없습니다: ${op.itemId}`);
      const { data, ...rest } = op.patch;
      const cur = items.get(id)!;
      const merged = data ? mergeData(cur, data) : undefined;
      items.update(id, { ...rest, ...(merged ? { data: merged } : {}) });
      activity.log(projectId, "item.update", cur.title, { id, summary: p.summary }, "manny");
    } else if (op.kind === "item.delete") {
      const id = resolve(op.itemId);
      if (!id) throw new Error(`항목을 찾을 수 없습니다: ${op.itemId}`);
      const cur = items.get(id)!;
      items.remove(id);
      activity.log(projectId, "item.delete", cur.title, { id, summary: p.summary }, "manny");
    }
    p.status = "accepted";
  }
  const target = proposals.find((p) => p.id === proposalId);
  if (!target) throw new Error("proposal not found");
  applyOne(target);
  return chats.updateMessage(message.id, { proposals }) ?? { ...message, proposals };
}

function mergeData(cur: Item, patch: Record<string, unknown>): Partial<Item["data"]> {
  if (cur.type === "spec") {
    const sd = cur.data as SpecData;
    return { slots: { ...(sd.slots ?? {}), ...((patch.slots as Record<string, string>) ?? {}) } } as Partial<SpecData>;
  }
  if (cur.type === "feature") {
    const out: Partial<FeatureData> = {};
    if (patch.roles) out.roles = patch.roles as string[];
    if (patch.rationale !== undefined) out.rationale = patch.rationale as string;
    if (patch.successCriteria !== undefined) out.successCriteria = patch.successCriteria as string;
    return out;
  }
  const out: Partial<RequirementData> = {};
  if (patch.acceptance) {
    const existing = (cur.data as RequirementData).acceptance ?? [];
    out.acceptance = [...existing, ...(patch.acceptance as RequirementData["acceptance"])];
  }
  return out;
}

export function rejectProposal(message: ChatMessage, proposalId: string): ChatMessage {
  const proposals = message.proposals.map((p) => (p.id === proposalId && p.status === "pending" ? { ...p, status: "rejected" as const } : p));
  return chats.updateMessage(message.id, { proposals }) ?? { ...message, proposals };
}

/** 제안 카드용 사람이 읽는 라벨 */
export function describeOp(op: ProposalOp): string {
  if (op.kind === "prd.set") return `PRD · ${op.sectionKey} · ${op.label}`;
  if (op.kind === "item.create") return `${op.type} 생성: ${op.title}`;
  if (op.kind === "item.update") return `항목 수정: ${op.itemId}`;
  return `항목 삭제: ${op.itemId}`;
}
