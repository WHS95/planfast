/**
 * 화면설계서(프로그램 정의서) — 페이지 1개 = 한 장(章) 으로 문서를 통째로 조립한다.
 *
 * 실무 정의서의 구성을 그대로 따른다:
 *   표지 → 개정 이력 → 목차(IA) → [페이지별] 정의·to-do → 정책 → 플로우 → 화면
 *
 * 데이터는 전부 이미 앱 안에 있는 것을 끌어 쓴다(새로 입력받지 않는다).
 *   정의   ← 정보구조도 페이지 설명
 *   to-do  ← 그 페이지에 연결된 상세기능 목록
 *   정책   ← 상세기능의 9개 슬롯 + 상위 요구사항의 인수조건
 *   플로우 ← 이름이 맞는 유저플로우(또는 프레임)
 *   화면   ← 이름이 맞는 와이어프레임 페이지 HTML
 * 매칭되는 자료가 없으면 빈칸을 지어내지 않고 "해당 없음"으로 남긴다.
 */
import {
  SPEC_SLOTS, SPEC_SLOT_LABEL,
  type Flow, type Item, type Page, type Project, type RequirementData, type SpecData, type Version, type Wireframe, type WireframePage,
} from "@/lib/types";
import { flattenPages } from "./ia";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 이름 매칭용 정규화 — 공백/괄호/조사성 접미어("페이지","화면")를 떼고 비교한다. */
const norm = (s: string) => s.toLowerCase().replace(/[\s()[\]{}·・_-]/g, "").replace(/(페이지|화면|page|screen)$/g, "");

export interface ScreenSpecInput {
  project: Project;
  pages: Page[];
  items: Item[];
  flows: Flow[];
  wireframes: { wf: Wireframe; pages: WireframePage[] }[];
  versions: Version[];
}

// ---- 매칭 -------------------------------------------------------------------

function matchFlow(page: Page, flows: Flow[]): { flow: Flow; frameId?: string } | null {
  const n = norm(page.name);
  if (!n) return null;
  for (const f of flows) {
    const frame = f.frames.find((fr) => norm(fr.label) === n);
    if (frame) return { flow: f, frameId: frame.id };
  }
  const byName = flows.find((f) => norm(f.name) === n) ?? flows.find((f) => norm(f.name).includes(n) && n.length >= 2);
  return byName ? { flow: byName } : null;
}

function matchWireframe(page: Page, wireframes: ScreenSpecInput["wireframes"]) {
  const n = norm(page.name);
  if (!n) return null;
  for (const { wf, pages } of wireframes) {
    const hit = pages.find((p) => p.status === "done" && p.html && norm(p.name) === n);
    if (hit) return { wf, page: hit };
  }
  return null;
}

// ---- 조각 렌더 ---------------------------------------------------------------

/** 유저플로우를 노드 좌표 그대로 SVG 로 그린다(프레임이 지정되면 그 프레임 노드만). */
function flowSvg(flow: Flow, frameId?: string): string {
  const nodes = frameId ? flow.nodes.filter((n) => n.frameId === frameId) : flow.nodes;
  if (!nodes.length) return `<p class="none">플로우 노드가 없습니다.</p>`;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = flow.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const W = 170, H = 54, PAD = 28;
  const minX = Math.min(...nodes.map((n) => n.position.x)), minY = Math.min(...nodes.map((n) => n.position.y));
  const w = Math.max(...nodes.map((n) => n.position.x)) - minX + W + PAD * 2;
  const h = Math.max(...nodes.map((n) => n.position.y)) - minY + H + PAD * 2;
  const at = (id: string) => { const n = nodes.find((x) => x.id === id)!; return { x: n.position.x - minX + PAD, y: n.position.y - minY + PAD }; };
  const fill: Record<string, string> = {
    start: "fill:#18181b;stroke:#18181b", page: "fill:#ffffff;stroke:#71717a",
    data: "fill:#f4f4f5;stroke:#a1a1aa;stroke-dasharray:4 3", branch: "fill:#fffbeb;stroke:#d97706", action: "fill:#eef2ff;stroke:#4f46e5",
  };
  const shapes = nodes.map((n) => {
    const p = at(n.id); const rx = n.type === "start" || n.type === "action" ? 26 : 6;
    const color = n.type === "start" ? "#ffffff" : "#18181b";
    const words = n.label.length > 22 ? [n.label.slice(0, 22), n.label.slice(22, 44)] : [n.label];
    const text = words.map((t, i) => `<tspan x="${p.x + W / 2}" dy="${i === 0 ? 0 : 13}">${esc(t)}</tspan>`).join("");
    return `<rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="${rx}" style="${fill[n.type] ?? fill.page};stroke-width:1.5"/>`
      + `<text x="${p.x + W / 2}" y="${p.y + H / 2 - (words.length - 1) * 6 + 4}" text-anchor="middle" font-size="11" fill="${color}">${text}</text>`;
  }).join("");
  const lines = edges.map((e) => {
    const a = at(e.source), b = at(e.target);
    const x1 = a.x + W / 2, y1 = a.y + H / 2, x2 = b.x + W / 2, y2 = b.y + H / 2;
    const label = e.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" font-size="10" fill="#52525b" text-anchor="middle" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${esc(e.label)}</text>` : "";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#a1a1aa" stroke-width="1.4" marker-end="url(#arrow)"/>${label}`;
  }).join("");
  return `<svg class="flow" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px">
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="18" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a1a1aa"/></marker></defs>
    ${lines}${shapes}</svg>`;
}

/** 상세기능 슬롯 + 상위 요구사항 인수조건을 [정책] 표로. */
function policyHtml(specs: Item[], items: Item[]): string {
  if (!specs.length) return `<p class="none">연결된 상세기능이 없어 표시할 정책이 없습니다.</p>`;
  const blocks = specs.map((sp) => {
    const d = sp.data as SpecData;
    const rows = SPEC_SLOTS.filter((k) => (d.slots?.[k] ?? "").trim()).map((k) =>
      `<tr><th>${SPEC_SLOT_LABEL[k]}</th><td>${esc(d.slots![k]!).replace(/\n/g, "<br/>")}</td></tr>`).join("");
    const feature = items.find((i) => i.id === sp.parentId);
    const req = feature ? items.find((i) => i.id === feature.parentId) : undefined;
    const acc = req ? ((req.data as RequirementData).acceptance ?? []).filter((a) => a.text.trim()) : [];
    return `<div class="policy">
      <h4>${esc(sp.title)}${feature ? `<span class="crumb">${esc(feature.title)}</span>` : ""}</h4>
      ${rows ? `<table class="slots">${rows}</table>` : `<p class="none">슬롯이 아직 작성되지 않았습니다.</p>`}
      ${acc.length ? `<div class="acc"><b>인수조건 · ${esc(req!.title)}</b><ul>${acc.map((a) => `<li>${esc(a.text)}</li>`).join("")}</ul></div>` : ""}
    </div>`;
  });
  return blocks.join("");
}

// ---- 문서 조립 ---------------------------------------------------------------

export function screenSpecHtml({ project, pages, items, flows, wireframes, versions }: ScreenSpecInput): string {
  const rows = flattenPages(pages);
  const today = new Date().toISOString().slice(0, 10);
  const specById = new Map(items.map((i) => [i.id, i]));

  const toc = rows.map(({ page, depth }, i) =>
    `<li style="margin-left:${depth * 16}px"><span class="no">${i + 1}</span> ${esc(page.name)}</li>`).join("");

  const history = versions.length
    ? versions.slice(0, 12).map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.createdAt.slice(0, 10))}</td><td>${v.auto ? "자동 저장" : "수동 저장"}</td></tr>`).join("")
    : `<tr><td colspan="3" class="none">저장된 버전이 없습니다.</td></tr>`;

  const chapters = rows.map(({ page }, i) => {
    const specs = page.linkedSpecIds.map((id) => specById.get(id)).filter((x): x is Item => !!x);
    const fm = matchFlow(page, flows);
    const wm = matchWireframe(page, wireframes);
    return `<section class="sheet">
      <header><h2><span class="no">${i + 1}</span> ${esc(page.name)}</h2><span class="doc">${esc(project.title)} · 화면설계서</span></header>

      <h3>[정의]</h3>
      <p class="def">${page.description ? esc(page.description).replace(/\n/g, "<br/>") : `<span class="none">설명이 아직 작성되지 않았습니다.</span>`}</p>

      <h3>[to-do]</h3>
      ${specs.length ? `<ul class="todo">${specs.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ul>`
        : `<p class="none">이 페이지에 연결된 상세기능이 없습니다. 정보구조도에서 상세기능을 연결하면 자동으로 채워집니다.</p>`}

      <h3>[정책]</h3>
      ${policyHtml(specs, items)}

      <h3>[플로우]</h3>
      ${fm ? `<p class="src">출처: ${esc(fm.flow.name)}${fm.frameId ? ` · ${esc(fm.flow.frames.find((f) => f.id === fm.frameId)?.label ?? "")}` : ""}</p>
             <div class="legend"><span class="lg lg-start">시작/종료</span><span class="lg lg-page">화면</span><span class="lg lg-action">유저 Action</span><span class="lg lg-branch">분기</span><span class="lg lg-data">시스템/데이터</span></div>
             ${flowSvg(fm.flow, fm.frameId)}`
        : `<p class="none">이 페이지 이름과 맞는 유저플로우(또는 프레임)를 찾지 못했습니다.</p>`}

      <h3>[화면]</h3>
      ${wm ? `<p class="src">출처: ${esc(wm.wf.name)} · ${wm.wf.device === "mobile" ? "모바일" : "데스크톱"}</p>
              <div class="shot ${wm.wf.device}"><iframe sandbox srcdoc="${esc(wm.page.html)}"></iframe></div>`
        : `<p class="none">이 페이지 이름과 맞는 와이어프레임을 찾지 못했습니다.</p>`}
    </section>`;
  }).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<title>${esc(project.title)} 화면설계서</title>
<style>
  :root { --line:#e4e4e7; --muted:#71717a; --accent:#4f46e5; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f4f4f5; color:#18181b; font:14px/1.6 -apple-system,'Apple SD Gothic Neo',Pretendard,'Malgun Gothic',sans-serif; }
  .sheet { width:1123px; min-height:794px; margin:16px auto; padding:40px 48px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.12); page-break-after:always; }
  header { display:flex; align-items:baseline; justify-content:space-between; border-bottom:2px solid #18181b; padding-bottom:10px; margin-bottom:22px; }
  h2 { font-size:20px; margin:0; } h3 { font-size:13px; margin:22px 0 8px; color:var(--accent); letter-spacing:.02em; }
  h4 { font-size:13px; margin:0 0 6px; } .doc { font-size:11px; color:var(--muted); }
  .no { display:inline-block; min-width:22px; padding:1px 6px; margin-right:6px; border-radius:4px; background:#eef2ff; color:var(--accent); font-size:12px; text-align:center; }
  .def { margin:0; }
  .none { color:var(--muted); font-size:12px; }
  .src { font-size:11px; color:var(--muted); margin:0 0 8px; }
  ul.todo { margin:0; padding-left:18px; } ul.todo li { margin:2px 0; }
  .policy { border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px; }
  .crumb { font-size:11px; color:var(--muted); font-weight:400; margin-left:8px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  .slots th { width:96px; text-align:left; vertical-align:top; padding:4px 8px 4px 0; color:var(--muted); font-weight:600; }
  .slots td { padding:4px 0; border-bottom:1px solid #f4f4f5; }
  .acc { margin-top:8px; font-size:12px; } .acc ul { margin:4px 0 0; padding-left:18px; }
  .legend { display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
  .lg { font-size:10px; border:1px solid var(--line); border-radius:20px; padding:1px 8px; color:var(--muted); }
  .lg-start { background:#18181b; color:#fff; border-color:#18181b; } .lg-action { background:#eef2ff; border-color:#4f46e5; color:#4f46e5; }
  .lg-branch { background:#fffbeb; border-color:#d97706; color:#b45309; } .lg-data { background:#f4f4f5; }
  .flow { border:1px solid var(--line); border-radius:6px; background:#fff; padding:8px; }
  .shot { border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#fff; }
  .shot iframe { border:0; width:100%; height:620px; display:block; }
  .shot.mobile { max-width:390px; } .shot.mobile iframe { height:760px; }
  .cover { display:flex; flex-direction:column; justify-content:center; }
  .cover h1 { font-size:38px; margin:0 0 12px; } .cover .meta { color:var(--muted); }
  .toc { columns:2; font-size:13px; list-style:none; padding:0; } .toc li { margin:3px 0; break-inside:avoid; }
  .hist th, .hist td { border:1px solid var(--line); padding:6px 10px; text-align:left; }
  .hist th { background:#fafafa; }
  @media print {
    body { background:#fff; }
    .sheet { width:auto; min-height:0; margin:0; box-shadow:none; padding:14mm; }
    @page { size:A4 landscape; margin:0; }
  }
</style></head><body>

<section class="sheet cover">
  <h1>${esc(project.title)}</h1>
  <div class="meta">화면설계서 (프로그램 정의서) · ${today}</div>
  ${project.description ? `<p style="margin-top:20px;max-width:640px">${esc(project.description)}</p>` : ""}
  <p class="none" style="margin-top:28px">페이지 ${rows.length}개 · 상세기능 ${items.filter((i) => i.type === "spec").length}개 · 유저플로우 ${flows.length}개</p>
</section>

<section class="sheet">
  <header><h2>개정 이력</h2><span class="doc">${esc(project.title)}</span></header>
  <table class="hist"><thead><tr><th style="width:50%">버전</th><th style="width:25%">일자</th><th>구분</th></tr></thead><tbody>${history}</tbody></table>
  <h3>목차</h3>
  <ul class="toc">${toc}</ul>
</section>

${chapters}
</body></html>`;
}
