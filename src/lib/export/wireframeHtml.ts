import type { Wireframe, WireframePage } from "@/lib/types";

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Single self-contained HTML: left page nav + one srcdoc iframe per page. */
export function wireframeToHtml(wf: Wireframe, pages: WireframePage[]): string {
  const ps = [...pages].sort((a, b) => a.order - b.order);
  const w = wf.device === "mobile" ? 390 : 1280;
  const h = wf.device === "mobile" ? 844 : 900;
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(wf.name)} · 와이어프레임</title>
<style>
  * { box-sizing: border-box; } html, body { height: 100%; margin: 0; }
  body { display: flex; font-family: -apple-system, "Apple SD Gothic Neo", Pretendard, sans-serif; font-size: 14px; color: #18181b; background: #f4f4f5; }
  nav { width: 240px; flex-shrink: 0; background: #fff; border-right: 1px solid #e4e4e7; display: flex; flex-direction: column; }
  nav h1 { font-size: 14px; margin: 0; padding: 14px 16px; border-bottom: 1px solid #e4e4e7; }
  nav h1 small { display: block; color: #71717a; font-weight: normal; font-size: 11px; margin-top: 2px; }
  nav ol { list-style: none; margin: 0; padding: 6px 0; overflow: auto; flex: 1; }
  nav li { padding: 7px 16px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  nav li:hover { background: #fafafa; } nav li.on { background: #eef2ff; color: #4f46e5; font-weight: 500; }
  nav li span { color: #a1a1aa; font-size: 11px; margin-right: 6px; }
  nav p { margin: 0; padding: 10px 16px; font-size: 11px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
  main { flex: 1; overflow: auto; padding: 24px; }
  .frame { display: none; margin: 0 auto; background: #fff; border: 1px solid #d4d4d8; border-radius: ${wf.device === "mobile" ? "36px" : "8px"}; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; width: ${w}px; }
  .frame.on { display: block; } iframe { display: block; border: 0; width: ${w}px; height: ${h}px; background: #fff; }
</style></head>
<body>
<nav><h1>${text(wf.name)}<small>${wf.device === "mobile" ? "모바일 390px" : "데스크톱 1280px"} · ${ps.length}개 페이지 · PlanFast</small></h1>
<ol>${ps.map((p, i) => `<li data-i="${i}"${i === 0 ? ' class="on"' : ""}><span>${i + 1}</span>${text(p.name)}</li>`).join("")}</ol>
<p>← → 키로 페이지 이동</p></nav>
<main>${ps.map((p, i) => `<div class="frame${i === 0 ? " on" : ""}" data-i="${i}"><iframe sandbox="" title="${attr(p.name)}" srcdoc="${attr(p.html || `<p style="padding:40px;color:#999;font-family:sans-serif">(${p.status === "error" ? "생성 실패" : "아직 생성되지 않음"})</p>`)}"></iframe></div>`).join("\n")}</main>
<script>
  var items = [].slice.call(document.querySelectorAll('nav li')), frames = [].slice.call(document.querySelectorAll('.frame')), cur = 0;
  function show(i) { cur = (i + items.length) % items.length; items.forEach(function (el, j) { el.classList.toggle('on', j === cur); }); frames.forEach(function (el, j) { el.classList.toggle('on', j === cur); }); }
  items.forEach(function (el, i) { el.addEventListener('click', function () { show(i); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft') show(cur - 1); });
</script>
</body></html>`;
}
