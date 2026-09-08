/**
 * 유저플로우 노드의 기본 렌더 크기.
 *
 * 배치 알고리즘은 `./autolayout.ts` 의 `stableLayout` 하나로 통일했다. 예전엔 여기 dagre 래퍼
 * (layoutGraph/layoutFlow/layoutTree)가 있었지만, 분기를 한 줄로 늘리고 노드가 하나만 늘어도
 * 전체를 재배치해 버려서 화면 전체가 흔들렸다.
 */
import type { FlowNodeType } from "@/lib/types";

/** Default rendered sizes of the 5 user-flow node kinds (must match FlowNodes.tsx styles). */
export const FLOW_NODE_SIZE: Record<FlowNodeType, { width: number; height: number }> = {
  start: { width: 132, height: 42 },
  page: { width: 200, height: 68 },
  data: { width: 190, height: 58 },
  branch: { width: 176, height: 84 },
  action: { width: 180, height: 46 },
};
