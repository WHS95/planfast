/**
 * 작업별 모델 배치 정책.
 *
 * 기획 작업은 성격이 다르다. "초기 세팅"과 "검증(모순·누락)"은 틀리면 뒤 문서가 전부 오염되므로
 * 머리를 많이 써야 하고, 나머지는 큰 틀 안에서 빠르게 채우고 피드백 받는 게 핵심이다.
 * 그래서 모든 AI 호출에 같은 모델을 쓰지 않고 작업을 4등급으로 나눠 등급마다 모델·노력을 다르게 둔다.
 *
 * 등급 기준 = "틀리면 얼마나 비싼가 × 사람이 나중에 발견·수정하기 얼마나 어려운가"
 *
 *   A 사고   틀리면 뒤 문서 전부 오염, 사람이 발견하기 어려움    → 가장 강한 모델, 높은 노력
 *   B 구조   큰 틀을 잡음. 한 번 잡히면 이후 작업의 뼈대         → 강한 모델, 보통 노력
 *   C 채우기 틀 안을 채움. 틀리면 그 칸만 고치면 됨              → 빠른 모델, 보통 노력
 *   D 다듬기 문구 수준. 즉시 눈으로 확인 가능                    → 가장 빠른 모델, 낮은 노력
 *
 * 호출부는 모델 이름이 아니라 **작업 이름(AiTask)** 을 넘긴다. 어느 작업이 어느 등급인지는 여기 한 곳에서만
 * 정하고, 등급→모델은 설정에서 사용자가 바꿀 수 있다(기본값 = 아래 DEFAULT_TIER_MODELS).
 */
import type { AiProvider } from "@/lib/types";

export const AI_TIERS = ["A", "B", "C", "D"] as const;
export type AiTier = (typeof AI_TIERS)[number];

export const AI_EFFORTS = ["low", "medium", "high"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface TierSpec { model: string; effort: AiEffort }
export type TierModels = Record<AiTier, TierSpec>;

/** 등급 설명 — 설정 화면과 문서에서 같은 문구를 쓴다. */
export const TIER_LABEL: Record<AiTier, { name: string; desc: string; hint: string }> = {
  A: { name: "사고", desc: "틀리면 뒤 문서가 전부 오염되는 작업. 모순·누락을 찾는 검증과 최초 요구사항 도출.", hint: "가장 느리고 구독 소모가 큽니다 (3~5분)" },
  B: { name: "구조", desc: "큰 틀을 잡는 작업. 한 번 잡히면 이후 모든 작업의 뼈대가 됩니다.", hint: "1~3분" },
  C: { name: "채우기", desc: "틀 안을 채우는 작업. 틀려도 그 칸만 고치면 됩니다.", hint: "수십 초~1분" },
  D: { name: "다듬기", desc: "문구 수준의 작업. 결과를 바로 눈으로 확인할 수 있습니다.", hint: "수 초" },
};

/** 최적 배치 기본값. 설정에서 바꿔도 이 값은 남아 "기본값으로 되돌리기"에 쓰인다. */
export const DEFAULT_TIER_MODELS: TierModels = {
  A: { model: "claude-fable-5-1", effort: "high" },
  B: { model: "opus", effort: "medium" },
  C: { model: "sonnet", effort: "medium" },
  D: { model: "haiku", effort: "low" },
};

/** 설정 화면에서 고를 수 있는 모델 목록. CLI 별칭 기준이며 API 프로바이더에선 resolveModel 이 전체 id 로 바꾼다. */
export const MODEL_CHOICES: { id: string; label: string; note: string }[] = [
  { id: "claude-fable-5-1", label: "Fable 5.1", note: "가장 강함 · 가장 느림" },
  { id: "opus", label: "Opus", note: "강함" },
  { id: "sonnet", label: "Sonnet", note: "균형" },
  { id: "haiku", label: "Haiku", note: "가장 빠름" },
];

/**
 * 작업 목록. 새 AI 호출을 추가할 땐 여기 먼저 등록하고 등급을 정한다.
 * 등급을 정할 때는 "이게 틀리면 무엇이 같이 틀리는가"를 먼저 물을 것.
 */
export const AI_TASKS = {
  // ── A 사고 ───────────────────────────────────────────────────────────────
  /** 정합성 감사(엣지케이스). 모순·누락 검증이 목적이므로 가장 강한 모델. */
  "review.edge_case": "A",
  /** 요구사항 최초 도출. 여기서 빠진 요구사항은 기능·상세기능·IA·플로우까지 전부 빠진 채 내려간다. */
  "features.requirements": "A",
  /** 회의록 → 결정 추출. 잘못 뽑힌 결정은 문서 변경 제안으로 이어진다. */
  "meeting.extract": "A",

  // ── B 구조 ───────────────────────────────────────────────────────────────
  "prd.draft": "B",
  "features.features": "B",
  "ia.generate": "B",
  "flow.generate": "B",
  /** 기본 6관점 검토. 정합성 감사와 역할을 나눠 이쪽은 B — 둘 다 A면 검토 한 번에 10분이 걸린다. */
  "review.basic": "B",
  /** 프로젝트 첫 대화(온보딩). 이후 대화의 방향을 잡는다. */
  "manny.kickoff": "B",

  // ── C 채우기 ─────────────────────────────────────────────────────────────
  "features.specs": "C",
  "features.slots": "C",
  "ia.children": "C",
  "ia.link": "C",
  "wireframe.page": "C",
  "meeting.apply": "C",
  /**
   * 매니 일반 대화. 문구만 보면 D 지만 한 스트림 안에서 문서 변경 제안이 나올 수 있고,
   * 제안이 나올지는 응답이 끝나야 안다. 문서에 손대는 경로라 C 로 둔다.
   */
  "manny.chat": "C",

  // ── D 다듬기 ─────────────────────────────────────────────────────────────
  "ia.enrich": "D",
} as const satisfies Record<string, AiTier>;

export type AiTask = keyof typeof AI_TASKS;

export const TASK_LABEL: Record<AiTask, string> = {
  "review.edge_case": "정합성 감사",
  "features.requirements": "요구사항 도출",
  "meeting.extract": "회의록 결정 추출",
  "prd.draft": "PRD 초안",
  "features.features": "기능 생성",
  "ia.generate": "정보구조도 생성",
  "flow.generate": "유저플로우 생성",
  "review.basic": "기본 검토(6관점)",
  "manny.kickoff": "프로젝트 첫 대화",
  "features.specs": "상세기능 생성",
  "features.slots": "슬롯 자동 작성",
  "ia.children": "하위 페이지 제안",
  "ia.link": "상세기능 연결",
  "wireframe.page": "와이어프레임 생성",
  "meeting.apply": "결정 반영",
  "manny.chat": "매니 대화",
  "ia.enrich": "설명 보강",
};

export function tierOf(task: AiTask): AiTier { return AI_TASKS[task]; }

/** 등급별 작업 목록(설정 화면 표시용). */
export function tasksByTier(): Record<AiTier, AiTask[]> {
  const out: Record<AiTier, AiTask[]> = { A: [], B: [], C: [], D: [] };
  for (const [t, tier] of Object.entries(AI_TASKS) as [AiTask, AiTier][]) out[tier].push(t);
  return out;
}

/** 설정값이 깨져 있어도(옛 버전·수동 편집) 항상 4등급이 다 채워진 표를 돌려준다. */
export function normalizeTierModels(raw: unknown): TierModels {
  const out = { ...DEFAULT_TIER_MODELS };
  if (!raw || typeof raw !== "object") return out;
  for (const tier of AI_TIERS) {
    const v = (raw as Record<string, unknown>)[tier];
    if (!v || typeof v !== "object") continue;
    const m = (v as { model?: unknown }).model;
    const e = (v as { effort?: unknown }).effort;
    out[tier] = {
      model: typeof m === "string" && m ? m : DEFAULT_TIER_MODELS[tier].model,
      effort: (AI_EFFORTS as readonly string[]).includes(e as string) ? (e as AiEffort) : DEFAULT_TIER_MODELS[tier].effort,
    };
  }
  return out;
}

/** 작업 → 실제로 쓸 {모델, 노력}. `override` 는 "이번만 한 단계 낮춰 실행" 같은 호출별 예외. */
export function resolveTask(task: AiTask, tiers: TierModels, override?: Partial<TierSpec>): TierSpec & { tier: AiTier } {
  const tier = tierOf(task);
  // 주의: `{ model: undefined }` 를 그대로 spread 하면 등급의 모델을 undefined 로 덮어쓴다(실제로 겪음: `--model undefined`).
  // 값이 있는 키만 덮어쓴다.
  const out: TierSpec & { tier: AiTier } = { tier, ...tiers[tier] };
  if (override?.model) out.model = override.model;
  if (override?.effort) out.effort = override.effort;
  return out;
}

/** API 프로바이더는 effort 를 모델 파라미터가 아니라 thinking 으로 표현한다. 이 매핑도 한 곳에. */
export function effortForProvider(effort: AiEffort, provider: AiProvider): { cliEffort?: string; thinking?: boolean } {
  if (provider === "claude-cli") return { cliEffort: effort };
  return { thinking: effort !== "low" };
}
