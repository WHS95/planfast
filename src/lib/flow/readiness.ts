/** 유저플로우 생성 전제조건: PRD 한 줄 정의 + 기능 1개 이상 (server only). */
import { items } from "@/lib/repo";
import type { Project } from "@/lib/types";

export interface FlowReadiness { ready: boolean; hasPrd: boolean; hasFeature: boolean }

export function flowReadiness(p: Project): FlowReadiness {
  const overview = p.prd.sections.find((s) => s.key === "overview");
  const oneLiner = overview?.fields.find((f) => f.label.includes("한 줄")) ?? overview?.fields[0];
  const hasPrd = !!oneLiner?.content?.trim();
  const hasFeature = items.list(p.id).some((i) => i.type === "feature");
  return { ready: hasPrd && hasFeature, hasPrd, hasFeature };
}
