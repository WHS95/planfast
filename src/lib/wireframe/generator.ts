/**
 * Wireframe page generator — in-process job runner.
 * One job per wireframe at a time (module-level Map). Pages are processed with a small
 * concurrency pool; each page becomes a self-contained low-fidelity HTML document.
 */
import { generateText } from "@/lib/ai";
import { prdToMarkdown } from "@/lib/ai/context";
import { projects, items, flows, wireframes, activity } from "@/lib/repo";
import type { Flow, FlowNode, Item, Wireframe, WireframePage } from "@/lib/types";

export type GenerateMode = "continue" | "all" | "page";

interface Job { wireframeId: string; startedAt: string; total: number }
const jobs = new Map<string, Job>();
const CONCURRENCY = 2;

export function isRunning(wireframeId: string) { return jobs.has(wireframeId); }

const SYSTEM = `당신은 제품 기획 문서를 바탕으로 저충실도(low-fidelity) 와이어프레임을 HTML로 그리는 UI 설계 도우미입니다.
요청받은 페이지 하나에 대해 **완전한 단일 HTML 문서**만 출력합니다.

규칙:
- <!DOCTYPE html>로 시작하는 하나의 HTML 문서. 설명, 마크다운 코드펜스, 주석 문장 없이 HTML만 출력.
- 모든 스타일은 <head> 안의 <style> 하나에 인라인. 외부 리소스(CDN, 폰트, 이미지 URL, 스크립트) 절대 금지. <script> 금지.
- 회색조 와이어프레임 룩: 배경 #fff, 선 #9ca3af~#d1d5db, 박스는 1px 실선 또는 점선 테두리, 이미지 자리는 대각선 X 박스(또는 "이미지" 라벨 박스), 텍스트 자리는 회색 막대(placeholder line)로, 실제 문구가 필요한 곳(헤더 제목, 버튼, 폼 라벨, 메뉴, 탭, 상태 메시지)은 한국어 라벨을 그대로 씁니다.
- 색은 흑백/회색만. 강조는 검정 배경 흰 글자(주요 버튼) 정도만 허용.
- 페이지의 핵심 요소(네비게이션, 콘텐츠 영역, 폼, 버튼, 상태/예외 안내)를 빠짐없이 배치하고 각 영역 우상단에 작은 회색 태그로 영역 이름을 표기합니다.
- 기능명세서에 정의된 동작/예외/권한/데이터가 화면에 어떻게 드러나는지 반영합니다 (예: 예외 상황 안내 문구, 권한 없음 상태, 빈 상태).
- 이 페이지에서 나가는 액션(버튼/링크)은 라벨에 목적지 페이지명을 괄호로 덧붙입니다. 예: "결제하기 (→ 결제 완료)".
- 폰트: font-family: -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif.`;

function stripFences(text: string): string {
  let t = text.trim();
  const m = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (m) t = m[1].trim();
  const i = t.search(/<!doctype html|<html/i);
  if (i > 0) t = t.slice(i);
  const end = t.lastIndexOf("</html>");
  if (end >= 0) t = t.slice(0, end + 7);
  return t;
}

function relatedItems(all: Item[], node: FlowNode | undefined, pageName: string): Item[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  const picked = new Map<string, Item>();
  const addWithAncestors = (it: Item) => {
    picked.set(it.id, it);
    let cur = it;
    while (cur.parentId && byId.has(cur.parentId)) { cur = byId.get(cur.parentId)!; picked.set(cur.id, cur); }
  };
  for (const id of node?.itemIds ?? []) { const it = byId.get(id); if (it) addWithAncestors(it); }
  const words = pageName.replace(/페이지|화면/g, "").split(/[\s/·,()]+/).map((w) => w.trim()).filter((w) => w.length >= 2);
  for (const it of all) {
    const hay = `${it.title} ${it.description}`;
    if (words.some((w) => hay.includes(w))) addWithAncestors(it);
  }
  return [...picked.values()].sort((a, b) => a.order - b.order);
}

function itemsBlock(list: Item[]): string {
  if (!list.length) return "(연관 항목 없음)";
  const out: string[] = [];
  for (const it of list) {
    const kind = it.type === "requirement" ? "요구사항" : it.type === "feature" ? "기능" : "상세기능";
    out.push(`- [${kind}] ${it.title}${it.description ? `: ${it.description}` : ""}`);
    if (it.type === "spec") {
      const slots = (it.data as { slots?: Record<string, string> }).slots ?? {};
      for (const [k, v] of Object.entries(slots)) if (v?.trim()) out.push(`    - ${k}: ${v}`);
    }
  }
  return out.join("\n").slice(0, 6000);
}

function buildPrompt(wf: Wireframe, page: WireframePage, flow: Flow | undefined, allItems: Item[], prdMd: string, extra?: string): string {
  const node = flow?.nodes.find((n) => n.id === page.sourceNodeId);
  const nodeById = new Map(flow?.nodes.map((n) => [n.id, n]) ?? []);
  const incoming = (flow?.edges ?? []).filter((e) => e.target === node?.id).map((e) => ({ from: nodeById.get(e.source), label: e.label }));
  const outgoing = (flow?.edges ?? []).filter((e) => e.source === node?.id).map((e) => ({ to: nodeById.get(e.target), label: e.label }));
  const size = wf.device === "mobile"
    ? "모바일: <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">, body 폭 390px 기준, 하단 탭바/상단 앱바 등 모바일 패턴 사용"
    : "데스크톱: 콘텐츠 최대 폭 1280px 중앙 정렬, 상단 글로벌 네비게이션 + 본문 레이아웃";
  return [
    `# 제품 개요(PRD 요약)\n${prdMd.slice(0, 3500) || "(비어 있음)"}`,
    flow ? `# 유저플로우: ${flow.name}${flow.request ? `\n요청: ${flow.request}` : ""}` : "",
    `# 이번에 그릴 페이지\n- 페이지명: ${page.name}${node?.description ? `\n- 설명: ${node.description}` : ""}`,
    incoming.length ? `## 이 페이지로 들어오는 경로\n${incoming.map((i) => `- ${i.from ? `[${i.from.type}] ${i.from.label}` : "?"}${i.label ? ` --(${i.label})-->` : ""}`).join("\n")}` : "",
    outgoing.length ? `## 이 페이지에서 나가는 경로 (버튼/링크로 표현)\n${outgoing.map((o) => `- ${o.label ? `(${o.label}) → ` : "→ "}${o.to ? `[${o.to.type}] ${o.to.label}${o.to.description ? `: ${o.to.description}` : ""}` : "?"}`).join("\n")}` : "",
    `# 연관 기능명세\n${itemsBlock(relatedItems(allItems, node, page.name))}`,
    `# 기기\n${size}`,
    wf.request ? `# 사용자 요청사항(전체)\n${wf.request}` : "",
    extra ? `# 이 페이지에 대한 추가 요청\n${extra}` : "",
    "위 정보를 바탕으로 이 페이지의 와이어프레임 HTML 문서 하나만 출력하세요.",
  ].filter(Boolean).join("\n\n");
}

async function generateOne(wf: Wireframe, page: WireframePage, ctx: { flow?: Flow; items: Item[]; prdMd: string }, extra?: string) {
  wireframes.updatePage(page.id, { status: "generating", error: null });
  try {
    const r = await generateText({ task: "wireframe.page", system: SYSTEM, prompt: buildPrompt(wf, page, ctx.flow, ctx.items, ctx.prdMd, extra), maxTokens: 12000 });
    const html = stripFences(r.data);
    if (!/<html/i.test(html) || html.length < 200) throw new Error("AI가 유효한 HTML을 반환하지 않았습니다");
    wireframes.updatePage(page.id, { html, status: "done", error: null });
  } catch (e) {
    wireframes.updatePage(page.id, { status: "error", error: (e as Error).message.slice(0, 500) });
  }
}

/**
 * Start a generation job. Returns false if a job is already running for this wireframe.
 * - all: reset every page to pending and regenerate
 * - continue: generate pending/error pages
 * - page: regenerate a single page (optionally with an extra request)
 */
export function startGeneration(wireframeId: string, opts: { mode: GenerateMode; pageId?: string; request?: string }): { started: boolean; reason?: string } {
  if (jobs.has(wireframeId)) return { started: false, reason: "이미 생성 중입니다" };
  const wf = wireframes.get(wireframeId);
  if (!wf) return { started: false, reason: "wireframe not found" };
  let targets = wireframes.pages(wireframeId);
  if (opts.mode === "all") {
    for (const p of targets) wireframes.updatePage(p.id, { status: "pending", error: null });
  } else if (opts.mode === "page") {
    targets = targets.filter((p) => p.id === opts.pageId);
    if (!targets.length) return { started: false, reason: "page not found" };
    wireframes.updatePage(targets[0].id, { status: "pending", error: null });
  } else {
    targets = targets.filter((p) => p.status === "pending" || p.status === "error");
    for (const p of targets) wireframes.updatePage(p.id, { status: "pending", error: null });
  }
  if (!targets.length) return { started: false, reason: "생성할 페이지가 없습니다" };

  const job: Job = { wireframeId, startedAt: new Date().toISOString(), total: targets.length };
  jobs.set(wireframeId, job);
  const project = projects.get(wf.projectId);
  const ctx = { flow: wf.flowId ? flows.get(wf.flowId) : undefined, items: items.list(wf.projectId), prdMd: project ? prdToMarkdown(project.prd, project.title) : "" };
  const queue = [...targets];
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const fresh = wireframes.getPage(next.id);
      if (!fresh || fresh.status !== "pending") continue; // deleted or changed meanwhile
      await generateOne(wf, fresh, ctx, opts.mode === "page" ? opts.request : undefined);
    }
  };
  Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    .catch((e) => {
      console.error("[wireframe] job failed", e);
      for (const p of wireframes.pages(wireframeId)) if (p.status === "generating" || p.status === "pending") wireframes.updatePage(p.id, { status: "error", error: (e as Error).message });
    })
    .finally(() => {
      jobs.delete(wireframeId);
      activity.log(wf.projectId, "wireframe.generate", wf.name, { mode: opts.mode, pages: job.total }, "manny");
    });
  return { started: true };
}
