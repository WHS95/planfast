/**
 * 스토리보드 내보내기 — 유즈케이스별로 화면을 순서대로 늘어놓은 한 장짜리 HTML.
 *
 * 화면설계서(screenSpec)가 "화면 하나를 자세히" 라면, 이쪽은 "상황 하나를 흐름으로" 보여준다.
 * 기획을 설명할 때 쓰는 문서라 인쇄(가로 A4)까지 고려한다.
 */
import type { Device, Wireframe, WireframePage } from "@/lib/types";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VIEWPORT: Record<Device, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  desktop: { w: 1280, h: 900 },
};

export const UNGROUPED_LABEL = "전체 흐름";

/** 유즈케이스별로 묶는다. 순서는 페이지 order 를 따른다(= 플로우 순서). */
export function groupPagesByUseCase(pages: WireframePage[]) {
  const order: string[] = [];
  const map = new Map<string, WireframePage[]>();
  for (const p of [...pages].sort((a, b) => a.order - b.order)) {
    const k = p.useCase?.trim() || UNGROUPED_LABEL;
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(p);
  }
  return order.map((k) => ({ useCase: k, pages: map.get(k)! }));
}

export function storyboardHtml(projectTitle: string, wf: Wireframe, pages: WireframePage[]): string {
  const vp = VIEWPORT[wf.device];
  const scale = wf.device === "mobile" ? 0.36 : 0.22;
  const w = Math.round(vp.w * scale), h = Math.round(vp.h * scale);
  const groups = groupPagesByUseCase(pages);
  const today = new Date().toISOString().slice(0, 10);

  let n = 0;
  const sections = groups.map((g) => {
    const cards = g.pages.map((p, i) => {
      n += 1;
      const body = p.status === "done" && p.html
        // srcdoc 로 실제 HTML 을 그대로 심는다 — 캡처 이미지가 아니라 진짜 화면이라 확대해도 깨지지 않는다.
        ? `<iframe sandbox srcdoc="${esc(p.html)}" style="width:${vp.w}px;height:${vp.h}px;transform:scale(${scale});transform-origin:top left;border:0;position:absolute;top:0;left:0"></iframe>`
        : `<div class="ph">${p.status === "error" ? "생성 실패" : "생성 대기"}</div>`;
      const arrow = i < g.pages.length - 1 ? `<div class="arrow" style="height:${h}px">→</div>` : "";
      return `<div class="item">
        <figure style="width:${w}px">
          <figcaption><b>[${n}]</b> ${esc(p.name)}</figcaption>
          <div class="screen" style="width:${w}px;height:${h}px">${body}</div>
        </figure>${arrow}
      </div>`;
    }).join("");
    return `<section>
      <h2>${esc(g.useCase)} <span class="count">${g.pages.length}개 화면</span></h2>
      <div class="row">${cards}</div>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<title>${esc(projectTitle)} · ${esc(wf.name)} 스토리보드</title>
<style>
  :root { --line:#e4e4e7; --muted:#71717a; --accent:#4f46e5; }
  *{box-sizing:border-box}
  body{margin:0;padding:32px 40px;background:#fff;color:#18181b;font:13px/1.6 -apple-system,'Apple SD Gothic Neo',Pretendard,'Malgun Gothic',sans-serif}
  header.doc{border-bottom:2px solid #18181b;padding-bottom:10px;margin-bottom:24px}
  header.doc h1{font-size:20px;margin:0 0 4px}
  header.doc .meta{font-size:11px;color:var(--muted)}
  section{margin-bottom:32px;break-inside:avoid}
  section h2{font-size:14px;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
  .count{font-size:11px;color:var(--muted);font-weight:400;margin-left:6px}
  .row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px 4px}
  .item{display:flex;align-items:flex-start}
  figure{margin:0}
  figcaption{font-size:11px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  figcaption b{color:var(--accent)}
  .screen{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:6px;background:#fff}
  .ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--muted);font-size:10px}
  .arrow{display:flex;align-items:center;color:var(--accent);font-size:18px;padding:0 6px}
  @media print { body{padding:12mm} @page{size:A4 landscape;margin:0} }
</style></head><body>
<header class="doc">
  <h1>${esc(wf.name)}</h1>
  <div class="meta">${esc(projectTitle)} · 스토리보드 · ${wf.device === "mobile" ? "모바일" : "데스크톱"} · 유즈케이스 ${groups.length}개 · 화면 ${pages.length}개 · ${today}</div>
</header>
${sections}
</body></html>`;
}
