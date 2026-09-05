/**
 * 라우트 핸들러용 프레임 정리.
 * `FlowFrame`(types.ts)에는 없는 캔버스 기하(x/y/w/h)를 그대로 통과시켜 저장한다.
 * → 새로고침할 때마다 레인을 다시 배치하지 않아도 된다. (`FrameBox` 참고)
 */
import type { FlowFrame } from "@/lib/types";
import { isFrameColor, type FrameBox } from "./frames";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);

export function sanitizeFrames(raw: unknown): FlowFrame[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FlowFrame[] = [];
  raw.forEach((r, i) => {
    const f = r as Partial<FrameBox> | null;
    const id = typeof f?.id === "string" ? f.id.trim() : "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    const geo: Partial<Pick<FrameBox, "x" | "y" | "w" | "h">> = {};
    const x = num(f?.x), y = num(f?.y), w = num(f?.w), h = num(f?.h);
    if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) { geo.x = x; geo.y = y; geo.w = w; geo.h = h; }
    out.push({
      id,
      label: String(f?.label ?? "").trim() || `프레임 ${i + 1}`,
      description: String(f?.description ?? ""),
      color: isFrameColor(f?.color) ? f.color : "neutral",
      order: num(f?.order) ?? i,
      ...geo,
    });
  });
  return out.sort((a, b) => a.order - b.order).map((f, i) => ({ ...f, order: i }));
}
