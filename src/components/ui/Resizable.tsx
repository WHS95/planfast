"use client";
/**
 * 재사용 리사이즈 유틸 — 드래그로 폭/높이를 바꾸고 localStorage 에 기억한다.
 *
 * ```tsx
 * const rz = useResizable({ id: "ia.list", initial: 280, min: 200, max: 480, edge: "right" });
 * <aside style={{ width: rz.size }} className="relative shrink-0 border-r">
 *   …목록…
 *   <ResizeHandle {...rz.handleProps} className="right-0 -mr-[3px]" label="목록 너비 조절" />
 * </aside>
 * ```
 *
 * - `id`      localStorage 키(`planfast:size:<id>`). 화면마다 다른 id 를 쓸 것.
 * - `edge`    핸들이 붙는 모서리. left/right → 가로(폭), top/bottom → 세로(높이).
 *             left·top 은 "바깥으로 끌면 커지는" 방향으로 자동 반전된다.
 * - 반환값    `{ size, dragging, setSize, reset, handleProps }`
 *             `size` 는 항상 min~max 로 클램프된 값. `dragging` 중엔 애니메이션을 끄면 된다.
 *             `handleProps` 는 <ResizeHandle> 에 그대로 펼쳐 넣는다(키보드 화살표·더블클릭 초기화 포함).
 *
 * 구현 메모: SSR/hydration 안전을 위해 useSyncExternalStore 로 읽는다(서버 스냅샷 = initial).
 * 드래그 중엔 rAF 로 합치고 localStorage 기록은 포인터를 뗄 때 한 번만 한다.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";

export type ResizeEdge = "left" | "right" | "top" | "bottom";

export interface ResizableOptions {
  id: string;
  initial: number;
  min?: number;
  max?: number;
  edge?: ResizeEdge;
  /** 키보드 화살표 1회 이동량 (기본 16px) */
  step?: number;
}

type HandleProps = React.ComponentPropsWithoutRef<"div"> & { "data-dragging": "true" | "false"; "data-axis": "x" | "y" };

export interface Resizable {
  size: number;
  dragging: boolean;
  setSize: (n: number) => void;
  reset: () => void;
  handleProps: HandleProps;
}

/* ── 아주 작은 external store (탭 간 동기화 + hydration 안전) ─────────────── */
const key = (id: string) => `planfast:size:${id}`;
const cache = new Map<string, number>();
const subs = new Map<string, Set<() => void>>();

function read(id: string, fallback: number): number {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  let v = fallback;
  try {
    const raw = window.localStorage.getItem(key(id));
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n)) v = n;
  } catch { /* private mode 등 */ }
  cache.set(id, v);
  return v;
}
function write(id: string, n: number, persist: boolean) {
  if (cache.get(id) === n && !persist) return;
  cache.set(id, n);
  if (persist) { try { window.localStorage.setItem(key(id), String(Math.round(n))); } catch { /* ignore */ } }
  subs.get(id)?.forEach((l) => l());
}
function subscribe(id: string, cb: () => void) {
  let set = subs.get(id);
  if (!set) { set = new Set(); subs.set(id, set); }
  set.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key(id)) return;
    const n = Number(e.newValue);
    if (Number.isFinite(n)) write(id, n, false);
  };
  window.addEventListener("storage", onStorage);
  return () => { set.delete(cb); window.removeEventListener("storage", onStorage); };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function useResizable({ id, initial, min = 160, max = 960, edge = "left", step = 16 }: ResizableOptions): Resizable {
  const horizontal = edge === "left" || edge === "right";
  const dir = edge === "left" || edge === "top" ? -1 : 1;

  const sub = useCallback((cb: () => void) => subscribe(id, cb), [id]);
  const snap = useCallback(() => read(id, initial), [id, initial]);
  const server = useCallback(() => initial, [initial]);
  const stored = useSyncExternalStore(sub, snap, server);
  const size = clamp(stored, min, max);

  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ active: boolean; origin: number; from: number; next: number; raf: number }>({ active: false, origin: 0, from: 0, next: 0, raf: 0 });

  const setSize = useCallback((n: number) => write(id, clamp(n, min, max), true), [id, min, max]);
  const reset = useCallback(() => setSize(initial), [setSize, initial]);
  // 렌더 시점의 size 가 아니라 스토어의 "지금 값"에서 더한다 (키 반복이 렌더보다 빨라도 정확)
  const bump = useCallback((delta: number) => {
    write(id, clamp(clamp(read(id, initial), min, max) + delta, min, max), true);
  }, [id, initial, min, max]);

  // 언마운트 시 rAF·전역 커서 정리 (여기서 setState 는 하지 않는다)
  useEffect(() => () => {
    if (drag.current.raf) cancelAnimationFrame(drag.current.raf);
    document.body.classList.remove("pf-resizing", "pf-resizing-row");
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current.active = true;
    drag.current.origin = horizontal ? e.clientX : e.clientY;
    drag.current.from = size;
    drag.current.next = size;
    setDragging(true);
    document.body.classList.add(horizontal ? "pf-resizing" : "pf-resizing-row");
  }, [horizontal, size]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const delta = (horizontal ? e.clientX : e.clientY) - d.origin;
    d.next = clamp(d.from + dir * delta, min, max);
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => { d.raf = 0; write(id, d.next, false); });
  }, [horizontal, dir, min, max, id]);

  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
    write(id, d.next, true);
    setDragging(false);
    document.body.classList.remove("pf-resizing", "pf-resizing-row");
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
  }, [id]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const dec = horizontal ? "ArrowLeft" : "ArrowUp";
    const inc = horizontal ? "ArrowRight" : "ArrowDown";
    if (e.key === dec || e.key === inc) { e.preventDefault(); bump(dir * step * (e.key === inc ? 1 : -1)); }
    else if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); reset(); }
  }, [horizontal, dir, step, bump, reset]);

  return {
    size,
    dragging,
    setSize,
    reset,
    handleProps: {
      role: "separator",
      tabIndex: 0,
      "aria-orientation": horizontal ? "vertical" : "horizontal",
      "aria-valuenow": Math.round(size),
      "aria-valuemin": min,
      "aria-valuemax": max,
      "data-dragging": dragging ? "true" : "false",
      "data-axis": horizontal ? "x" : "y",
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: reset,
      onKeyDown,
    },
  };
}

/** useResizable().handleProps 를 그대로 펼쳐 넣는 드래그 손잡이. 부모에 `relative` 필요. */
export function ResizeHandle({ className, label = "패널 크기 조절", ...props }: HandleProps & { label?: string }) {
  const vertical = props["data-axis"] !== "y";
  return (
    <div
      {...props}
      aria-label={label}
      title={label}
      className={clsx(
        "group absolute z-20 touch-none",
        vertical ? "inset-y-0 w-2 cursor-col-resize" : "inset-x-0 h-2 cursor-row-resize",
        "focus-visible:outline-none",
        className,
      )}
    >
      <span
        className={clsx(
          "absolute bg-transparent transition-colors duration-150",
          vertical ? "inset-y-0 left-1/2 w-[2px] -translate-x-1/2" : "inset-x-0 top-1/2 h-[2px] -translate-y-1/2",
          "group-hover:bg-accent/60 group-focus-visible:bg-accent",
          props["data-dragging"] === "true" && "!bg-accent",
        )}
      />
    </div>
  );
}
