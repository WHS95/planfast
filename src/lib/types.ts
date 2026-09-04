// Shared domain types & constants. Every module imports from here.

export const ITEM_TYPES = ["requirement", "feature", "spec"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_TYPE_LABEL: Record<ItemType, string> = { requirement: "요구사항", feature: "기능", spec: "상세기능" };
/** 계층: requirement → feature → spec */
export const CHILD_ITEM_TYPE: Record<ItemType, ItemType | null> = { requirement: "feature", feature: "spec", spec: null };
export const PARENT_ITEM_TYPE: Record<ItemType, ItemType | null> = { requirement: null, feature: "requirement", spec: "feature" };

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "낮음", medium: "중간", high: "높음" };

export const STATUSES = ["writing", "proposed", "confirmed", "dev", "done", "hold"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  writing: "기획 작성중",
  proposed: "기획 제안",
  confirmed: "기획 확정",
  dev: "개발 중",
  done: "개발 완료",
  hold: "보류",
};

/** 상세기능의 "개발 준비 슬롯" 9개 */
export const SPEC_SLOTS = [
  "precondition",
  "trigger",
  "action",
  "result",
  "exception",
  "display",
  "permission",
  "business_rule",
  "data",
] as const;
export type SpecSlot = (typeof SPEC_SLOTS)[number];
export const SPEC_SLOT_LABEL: Record<SpecSlot, string> = {
  precondition: "선행조건",
  trigger: "트리거",
  action: "동작",
  result: "결과",
  exception: "예외",
  display: "표시",
  permission: "권한 & 접근",
  business_rule: "비즈니스 규칙",
  data: "데이터",
};

export interface RequirementData {
  acceptance: { id: string; text: string; done: boolean }[];
}
export interface FeatureData {
  roles: string[];
  rationale: string;
  successCriteria: string;
}
export interface SpecData {
  slots: Partial<Record<SpecSlot, string>>;
  hiddenSlots: SpecSlot[];
}

export interface Item {
  id: string;
  projectId: string;
  type: ItemType;
  parentId: string | null;
  order: number;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  data: RequirementData | FeatureData | SpecData;
  /** true while an AI-generated item is awaiting the user's 승인/거절 (shown as "신규" in the tree) */
  aiProposed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** PRD: 5 fixed sections + custom items. Each section has editable label/content items. */
export const PRD_SECTION_KEYS = ["overview", "problem", "target", "success", "attributes"] as const;
export type PrdSectionKey = (typeof PRD_SECTION_KEYS)[number];

export interface PrdField {
  id: string;
  label: string;
  content: string;
  /** attributes 섹션에서 사용: 칩 형태 값 */
  values?: string[];
}
export interface PrdSection {
  id: string;
  key: PrdSectionKey | "custom";
  title: string;
  fields: PrdField[];
}
export interface Prd {
  sections: PrdSection[];
}

export function defaultPrd(): Prd {
  const f = (label: string, content = ""): PrdField => ({ id: rid(), label, content });
  return {
    sections: [
      { id: rid(), key: "overview", title: "개요", fields: [f("한 줄 정의"), f("제품 목표"), f("배경")] },
      { id: rid(), key: "problem", title: "문제 및 해결 방안", fields: [f("사용자 문제"), f("해결 방식"), f("차별점"), f("비목표")] },
      { id: rid(), key: "target", title: "타겟 및 시나리오", fields: [f("주요 사용자"), f("이용 상황 / 시나리오")] },
      { id: rid(), key: "success", title: "성공·위험 요소", fields: [f("핵심 지표"), f("예상 리스크")] },
      {
        id: rid(),
        key: "attributes",
        title: "속성 설정",
        fields: [
          { id: rid(), label: "카테고리", content: "", values: [] },
          { id: rid(), label: "사용자 역할", content: "", values: [] },
          { id: rid(), label: "이용 기기", content: "", values: [] },
        ],
      },
    ],
  };
}

export interface ProjectSettings {
  /** 매니 커스터마이징 */
  chatTone: string;
  docStyle: string;
  featureTemplate: string;
  glossary: { term: string; meaning: string }[];
  allowAiTraining: boolean;
}
export function defaultProjectSettings(): ProjectSettings {
  return { chatTone: "", docStyle: "", featureTemplate: "", glossary: [], allowAiTraining: false };
}

export interface Project {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  starred: boolean;
  deletedAt: string | null;
  prd: Prd;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/** 정보구조도 페이지 */
export interface Page {
  id: string;
  projectId: string;
  parentId: string | null;
  order: number;
  name: string;
  description: string;
  linkedSpecIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 유저플로우 */
export const FLOW_NODE_TYPES = ["start", "page", "data", "branch", "action"] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];
export const FLOW_NODE_LABEL: Record<FlowNodeType, string> = {
  start: "시작",
  page: "페이지",
  data: "데이터",
  branch: "분기",
  action: "행동",
};
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  description: string;
  position: { x: number; y: number };
  /** 기능명세서 아이템 연결 (optional) */
  itemIds?: string[];
  /** 소속 프레임(스윔레인). 없으면 프레임 밖 */
  frameId?: string;
}
/** 유저플로우 프레임(스윔레인): 상황/시나리오 단위로 노드를 묶는 가로 레인 */
export interface FlowFrame {
  id: string;
  label: string;
  description?: string;
  color?: string;
  order: number;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface Flow {
  id: string;
  projectId: string;
  name: string;
  request: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  frames: FlowFrame[];
  createdAt: string;
  updatedAt: string;
}

/** 와이어프레임 */
export type Device = "desktop" | "mobile";
export type WfPageStatus = "pending" | "generating" | "done" | "error";
export interface Wireframe {
  id: string;
  projectId: string;
  flowId: string | null;
  name: string;
  device: Device;
  request: string;
  createdAt: string;
  updatedAt: string;
}
export interface WireframePage {
  id: string;
  wireframeId: string;
  order: number;
  name: string;
  sourceNodeId: string | null;
  html: string;
  status: WfPageStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 매니 채팅 */
export interface Chat {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
}
export type ProposalOp =
  | { kind: "prd.set"; sectionKey: string; label: string; content: string }
  | { kind: "item.create"; tempId: string; type: ItemType; parentId: string | null; title: string; description: string; data?: Partial<SpecData & FeatureData & RequirementData> }
  | { kind: "item.update"; itemId: string; patch: Partial<Pick<Item, "title" | "description" | "priority" | "status">> & { data?: Record<string, unknown> } }
  | { kind: "item.delete"; itemId: string };
export interface Proposal {
  id: string;
  summary: string;
  op: ProposalOp;
  status: "pending" | "accepted" | "rejected";
  /** item.create 반영 후 실제 생성된 항목 id (같은 메시지 내 tempId 참조 해석용) */
  resultId?: string;
}
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  text: string; // extracted text
}
export type MessageStatus = "streaming" | "done" | "error";
export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  mentions: { type: "prd" | "item" | "flow" | "wireframe"; id: string; label: string }[];
  attachments: Attachment[];
  proposals: Proposal[];
  /** assistant messages are created as "streaming" by the server job and flipped to done/error when finished */
  status: MessageStatus;
  createdAt: string;
}

/** 검토 */
export const REVIEW_PERSPECTIVES = ["dev", "business", "ux", "design", "qa", "security", "edge_case"] as const;
export type ReviewPerspective = (typeof REVIEW_PERSPECTIVES)[number];
export const REVIEW_PERSPECTIVE_LABEL: Record<ReviewPerspective, string> = {
  dev: "개발",
  business: "사업",
  ux: "UX",
  design: "디자인",
  qa: "QA",
  security: "보안",
  /** spec-edge-case-auditor 방법론(요구사항 분해→상태 매트릭스→경계값→비정상 흐름→5W1H) 기반 정합성 감사. 항상 Fable 5.1로 실행. */
  edge_case: "정합성 감사 (엣지케이스)",
};
export interface Review {
  id: string;
  projectId: string;
  perspectives: ReviewPerspective[];
  status: "running" | "done" | "error";
  createdAt: string;
}
export interface ReviewItem {
  id: string;
  reviewId: string;
  projectId: string;
  perspective: ReviewPerspective;
  /** critical=S1(금전·데이터 손상), warn=S2/주의(기능 불가·상태 꼬임 또는 일반 주의), suggest=S3/제안 */
  severity: "critical" | "warn" | "suggest";
  /** "prd:<sectionKey>" | "item:<itemId>" */
  target: string;
  targetLabel: string;
  title: string;
  body: string;
  status: "open" | "hold" | "resolved";
  createdAt: string;
}

/** 기획실 (회의록 → 결정) */
export interface Meeting {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  heldAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface Decision {
  id: string;
  meetingId: string;
  projectId: string | null;
  text: string;
  rationale: string;
  status: "confirmed" | "undecided" | "rejected";
  applied: boolean;
  createdAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  name: string;
  auto: boolean;
  snapshot: ProjectSnapshot;
  createdAt: string;
}
export interface ProjectSnapshot {
  project: Pick<Project, "title" | "description" | "prd" | "settings">;
  items: Item[];
  pages: Page[];
  flows: Flow[];
}

export interface Activity {
  id: string;
  projectId: string;
  actor: string; // "user" | "manny" | "mcp"
  action: string; // e.g. "item.create"
  target: string; // human readable
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface Comment {
  id: string;
  projectId: string;
  /** "prd:<fieldId>" | "item:<itemId>" | "flow:<flowId>" | "wireframe:<pageId>" */
  target: string;
  x: number | null;
  y: number | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface ShareLink {
  id: string; // token
  projectId: string;
  expiresAt: string | null;
  disabled: boolean;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string; // pf_sk_...
  createdAt: string;
  lastUsedAt: string | null;
}

export type AiProvider = "claude-cli" | "anthropic-api";
export interface AppSettings {
  aiProvider: AiProvider;
  model: string; // "sonnet" | "opus" | full id
  anthropicApiKey: string;
  theme: "light" | "dark" | "system";
  displayName: string;
}
export function defaultAppSettings(): AppSettings {
  return { aiProvider: "claude-cli", model: "sonnet", anthropicApiKey: "", theme: "system", displayName: "나" };
}

export function rid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
export function now(): string {
  return new Date().toISOString();
}
