"use client";
/**
 * 스토리보드 — 유즈케이스별로 화면을 순서대로 늘어놓아 "이 상황에서 사용자가 어떤 화면을 거치는지"를
 * 한눈에 보게 한다. 화면 한 장씩 보는 뷰는 개별 화면을 다듬을 때, 이 뷰는 흐름을 설명할 때 쓴다.
 *
 * 유즈케이스는 유저플로우의 프레임(스윔레인) 라벨을 생성 시점에 스냅샷으로 박아둔 값이다.
 * 프레임 없이 만든 와이어프레임은 전부 "전체 흐름" 하나로 묶인다.
 */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowRight, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import type { Device, WireframePage } from "@/lib/types";

/** 실제 렌더 크기(축소 전) — 기기별 뷰포트 */
const VIEWPORT: Record<Device, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  desktop: { w: 1280, h: 900 },
};
const SCALES = [0.22, 0.3, 0.4] as const;

export const UNGROUPED = "전체 흐름";

export function groupByUseCase(pages: WireframePage[]): { useCase: string; pages: WireframePage[] }[] {
  const order: string[] = [];
  const map = new Map<string, WireframePage[]>();
  for (const p of [...pages].sort((a, b) => a.order - b.order)) {
    const k = p.useCase?.trim() || UNGROUPED;
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(p);
  }
  return order.map((k) => ({ useCase: k, pages: map.get(k)! }));
}

export function Storyboard({
  pages, device, onOpen,
}: { pages: WireframePage[]; device: Device; onOpen: (p: WireframePage) => void }) {
  const [scaleIdx, setScaleIdx] = useState(device === "mobile" ? 1 : 0);
  const scale = SCALES[scaleIdx];
  // 번호는 렌더 중 증가시키지 말고 미리 매긴다(렌더는 순수해야 한다).
  const groups = useMemo(() => {
    let n = 0;
    return groupByUseCase(pages).map((g) => ({ ...g, pages: g.pages.map((p) => ({ page: p, no: ++n })) }));
  }, [pages]);
  const vp = VIEWPORT[device];
  const cardW = Math.round(vp.w * scale);
  const cardH = Math.round(vp.h * scale);

  if (!pages.length) return <div className="text-sm text-muted text-center py-20">화면이 없습니다.</div>;

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-2">
        <div className="text-[11px] text-muted">유즈케이스 {groups.length}개 · 화면 {pages.length}개</div>
        <div className="ml-auto inline-flex border rounded-md overflow-hidden">
          <button className="px-2 py-1 disabled:opacity-40" title="축소" disabled={scaleIdx === 0} onClick={() => setScaleIdx((i) => Math.max(0, i - 1))}><ZoomOut size={13} /></button>
          <button className="px-2 py-1 border-l disabled:opacity-40" title="확대" disabled={scaleIdx === SCALES.length - 1} onClick={() => setScaleIdx((i) => Math.min(SCALES.length - 1, i + 1))}><ZoomIn size={13} /></button>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.useCase}>
          <header className="flex items-baseline gap-2 mb-3 pb-1.5 border-b">
            <h3 className="text-sm font-semibold">{g.useCase}</h3>
            <span className="text-[11px] text-muted">{g.pages.length}개 화면</span>
          </header>
          <div className="flex flex-wrap items-start gap-x-1 gap-y-6">
            {g.pages.map(({ page: p, no }, i) => (
                <div key={p.id} className="flex items-start">
                  <figure className="shrink-0" style={{ width: cardW }}>
                    <figcaption className="mb-1.5 flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[11px] font-semibold text-accent shrink-0">[{no}]</span>
                      <span className="text-[11px] truncate" title={p.name}>{p.name}</span>
                      <button className="ml-auto text-muted hover:text-accent shrink-0" title="이 화면 열기" onClick={() => onOpen(p)}><ExternalLink size={11} /></button>
                    </figcaption>
                    <ScreenThumb page={p} vp={vp} scale={scale} onOpen={() => onOpen(p)} />
                  </figure>
                  {i < g.pages.length - 1 && (
                    <div className="shrink-0 flex items-center self-center" style={{ height: cardH }} aria-hidden>
                      <ArrowRight size={16} className="text-accent mx-0.5" />
                    </div>
                  )}
                </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScreenThumb({ page, vp, scale, onOpen }: { page: WireframePage; vp: { w: number; h: number }; scale: number; onOpen: () => void }) {
  const w = Math.round(vp.w * scale), h = Math.round(vp.h * scale);
  const shell = "rounded-md border bg-white overflow-hidden relative";
  if (page.status !== "done" || !page.html) {
    return (
      <div className={clsx(shell, "flex items-center justify-center text-[10px] text-muted")} style={{ width: w, height: h }}>
        {page.status === "generating" ? "생성 중…" : page.status === "error" ? "생성 실패" : "생성 대기"}
      </div>
    );
  }
  return (
    <button className={clsx(shell, "block cursor-zoom-in hover:ring-2 hover:ring-accent/40")} style={{ width: w, height: h }} onClick={onOpen} title={page.name}>
      {/* 실제 뷰포트로 렌더한 뒤 축소 — 폭을 줄여 렌더하면 반응형 레이아웃이 달라져 실제 화면과 달라진다 */}
      <iframe
        sandbox="" srcDoc={page.html} title={page.name} tabIndex={-1}
        style={{ width: vp.w, height: vp.h, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, pointerEvents: "none", position: "absolute", top: 0, left: 0 }}
      />
    </button>
  );
}
