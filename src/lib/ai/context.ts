/** Builds textual context of a project for prompts (PRD + feature spec + flows). */
import { projects, items, pages, flows } from "@/lib/repo";
import { PRIORITY_LABEL, SPEC_SLOT_LABEL, STATUS_LABEL, type Item, type Prd, type Project, type SpecData, type FeatureData, type RequirementData, type SpecSlot } from "@/lib/types";

export function prdToMarkdown(prd: Prd, title?: string): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`, "");
  for (const sec of prd.sections) {
    lines.push(`## ${sec.title}`);
    for (const f of sec.fields) {
      const val = f.values && f.values.length ? f.values.join(", ") : f.content;
      if (val?.trim()) lines.push(`- **${f.label}**: ${val.replace(/\n/g, "\n  ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function itemsToMarkdown(list: Item[], opts: { withIds?: boolean; withSlots?: boolean } = {}): string {
  const byParent = new Map<string | null, Item[]>();
  for (const it of list) byParent.set(it.parentId, [...(byParent.get(it.parentId) ?? []), it]);
  for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order);
  const out: string[] = [];
  const id = (it: Item) => (opts.withIds ? ` \`[${it.id}]\`` : "");
  const meta = (it: Item) => ` (중요도: ${PRIORITY_LABEL[it.priority]}, 상태: ${STATUS_LABEL[it.status]})`;
  for (const req of byParent.get(null) ?? []) {
    if (req.type !== "requirement") continue;
    out.push(`## 요구사항: ${req.title}${id(req)}${meta(req)}`);
    if (req.description) out.push(req.description);
    const acc = (req.data as RequirementData).acceptance ?? [];
    if (acc.length) out.push("수용 기준:", ...acc.map((a) => `- [${a.done ? "x" : " "}] ${a.text}`));
    for (const feat of byParent.get(req.id) ?? []) {
      out.push(`### 기능: ${feat.title}${id(feat)}${meta(feat)}`);
      if (feat.description) out.push(feat.description);
      const fd = feat.data as FeatureData;
      if (fd.roles?.length) out.push(`- 사용자 역할: ${fd.roles.join(", ")}`);
      if (fd.rationale) out.push(`- 근거: ${fd.rationale}`);
      if (fd.successCriteria) out.push(`- 성공 기준: ${fd.successCriteria}`);
      for (const spec of byParent.get(feat.id) ?? []) {
        out.push(`#### 상세기능: ${spec.title}${id(spec)}${meta(spec)}`);
        if (spec.description) out.push(spec.description);
        if (opts.withSlots !== false) {
          const sd = spec.data as SpecData;
          for (const [k, v] of Object.entries(sd.slots ?? {})) if (v?.trim()) out.push(`- ${SPEC_SLOT_LABEL[k as SpecSlot] ?? k}: ${v}`);
        }
      }
    }
    out.push("");
  }
  return out.join("\n");
}

export function projectContext(projectId: string, opts: { withIds?: boolean; includeFlows?: boolean; includePages?: boolean } = {}): { project: Project; text: string } {
  const p = projects.get(projectId);
  if (!p) throw new Error("project not found");
  const parts = [prdToMarkdown(p.prd, p.title), "# 기능명세서", itemsToMarkdown(items.list(projectId), { withIds: opts.withIds })];
  if (opts.includePages) {
    const ps = pages.list(projectId);
    if (ps.length) parts.push("# 정보구조도", ...ps.map((x) => `- ${x.name}${x.parentId ? ` (상위: ${ps.find((y) => y.id === x.parentId)?.name ?? "?"})` : ""}: ${x.description}`));
  }
  if (opts.includeFlows) {
    for (const f of flows.list(projectId)) {
      parts.push(`# 유저플로우: ${f.name}`, ...f.nodes.map((n) => `- [${n.type}] ${n.label}${n.description ? `: ${n.description}` : ""}`),
        "연결:", ...f.edges.map((e) => `- ${f.nodes.find((n) => n.id === e.source)?.label} → ${f.nodes.find((n) => n.id === e.target)?.label}${e.label ? ` (${e.label})` : ""}`));
    }
  }
  const s = p.settings;
  const custom: string[] = [];
  if (s.docStyle) custom.push(`문서 문체: ${s.docStyle}`);
  if (s.chatTone) custom.push(`채팅 말투: ${s.chatTone}`);
  if (s.featureTemplate) custom.push(`기능 양식: ${s.featureTemplate}`);
  if (s.glossary?.length) custom.push("용어집:", ...s.glossary.map((g) => `- ${g.term}: ${g.meaning}`));
  if (custom.length) parts.push("# 프로젝트 작성 규칙", ...custom);
  return { project: p, text: parts.join("\n\n") };
}

export const MANNY_SYSTEM = `당신은 "매니"라는 이름의 소프트웨어 제품 기획 전문 AI 에이전트입니다.
PRD, 기능명세서(요구사항→기능→상세기능), 정보구조도, 유저플로우, 와이어프레임을 다루며,
사용자가 아이디어를 명확한 설계 문서로 만드는 것을 돕습니다. 한국어로 간결하고 구체적으로 답합니다.
기획 항목을 만들거나 고칠 때는 논리적 근거를 함께 제시하고, 누락된 정책·예외·권한을 먼저 짚어줍니다.`;
