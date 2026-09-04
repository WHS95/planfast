"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { FileSpreadsheet, FileText, FileCode2, Image as ImageIcon, GitBranch, Copy, Check, LayoutTemplate } from "lucide-react";
import type { Flow, FlowNodeType, Project, Wireframe, WireframePage } from "@/lib/types";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui";

type Doc = "features" | "flow" | "wireframe";
type FlowLite = { id: string; name: string; nodes: number };
type WfLite = Wireframe & { pages: WireframePage[] };

function download(url: string) { const a = document.createElement("a"); a.href = url; a.rel = "noopener"; a.click(); }
function dataUrlDownload(dataUrl: string, name: string) { const a = document.createElement("a"); a.href = dataUrl; a.download = name; a.click(); }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Tiny markdown → HTML for the printable PNG (headings / bullets / bold only). */
function mdToHtml(md: string): string {
  const out: string[] = []; let inList = false;
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]*)`/g, "<code>$1</code>");
  for (const raw of md.split("\n")) {
    const h = raw.match(/^(#{1,6})\s+(.*)$/); const li = raw.match(/^\s*- (.*)$/);
    if (li) { if (!inList) { out.push("<ul>"); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (inList) { out.push("</ul>"); inList = false; }
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

interface ExportButtonProps { k: string; icon: React.ComponentType<{ size?: number }>; label: string; hint: string; onClick: () => void; disabled?: boolean; busy: string | null }
function ExportButton({ k, icon: Icon, label, hint, onClick, disabled, busy }: ExportButtonProps) {
  return (
    <button className="card px-3 py-2.5 text-left flex items-center gap-3 hover:bg-black/[.02] disabled:opacity-50 w-full" disabled={busy !== null || disabled} onClick={onClick}>
      <span className="text-accent shrink-0">{busy === k ? <Spinner /> : <Icon size={18} />}</span>
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="block text-[11px] text-muted">{hint}</span></span>
    </button>
  );
}

export function ExportDialog({ project, current, onClose }: { project: Project; current?: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc>(current === "flow" ? "flow" : current === "wireframe" ? "wireframe" : "features");
  const [flows, setFlows] = useState<FlowLite[]>([]);
  const [flowId, setFlowId] = useState("");
  const [wfs, setWfs] = useState<WfLite[]>([]);
  const [wfId, setWfId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hidden = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pid = project.id;
  const exp = (q: string) => `/api/projects/${pid}/export?type=${q}`;

  useEffect(() => {
    api<FlowLite[]>(exp("flows")).then((l) => { setFlows(l); setFlowId((c) => c || l[0]?.id || ""); }).catch(() => {});
    api<WfLite[]>(`/api/projects/${pid}/wireframes`).then((l) => { setWfs(l); setWfId((c) => c || l[0]?.id || ""); }).catch(() => {});
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  // ---- features PNG: render printable HTML in hidden div → toPng
  async function featuresPng() {
    const res = await fetch(exp("features-md")); if (!res.ok) throw new Error("문서를 불러오지 못했습니다");
    const md = await res.text();
    const el = hidden.current!;
    el.innerHTML = `<div class="pf-print">${mdToHtml(md)}</div>`;
    const { toPng } = await import("html-to-image");
    const node = el.firstElementChild as HTMLElement;
    const url = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
    dataUrlDownload(url, `${project.title}_기능명세서.png`);
    el.innerHTML = "";
  }

  // ---- flow PNG: simplified rendering from nodes+positions
  async function flowPng() {
    const f = await api<Flow>(exp(`flow-json&flowId=${flowId}`));
    if (!f.nodes.length) throw new Error("노드가 없습니다");
    const W = 180, H = 56, PAD = 40;
    const minX = Math.min(...f.nodes.map((n) => n.position.x)), minY = Math.min(...f.nodes.map((n) => n.position.y));
    const maxX = Math.max(...f.nodes.map((n) => n.position.x)) + W, maxY = Math.max(...f.nodes.map((n) => n.position.y)) + H;
    const w = maxX - minX + PAD * 2, h = maxY - minY + PAD * 2;
    const pos = (id: string) => { const n = f.nodes.find((x) => x.id === id)!; return { x: n.position.x - minX + PAD, y: n.position.y - minY + PAD }; };
    const style: Record<FlowNodeType, string> = {
      start: "border-radius:28px;background:#18181b;color:#fff;border-color:#18181b",
      page: "border-radius:8px;background:#fff",
      data: "border-radius:8px;background:#f4f4f5;border-style:dashed",
      branch: "border-radius:8px;background:#fffbeb;border-color:#d97706",
      action: "border-radius:28px;background:#eef2ff;border-color:#4f46e5",
    };
    const edges = f.edges.map((e) => {
      const a = f.nodes.find((n) => n.id === e.source), b = f.nodes.find((n) => n.id === e.target); if (!a || !b) return "";
      const p = pos(a.id), q = pos(b.id);
      const x1 = p.x + W / 2, y1 = p.y + H / 2, x2 = q.x + W / 2, y2 = q.y + H / 2;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#a1a1aa" stroke-width="1.5" marker-end="url(#ar)"/>${e.label ? `<text x="${mx}" y="${my - 6}" font-size="11" fill="#52525b" text-anchor="middle" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${esc(e.label)}</text>` : ""}`;
    }).join("");
    const nodes = f.nodes.map((n) => { const p = pos(n.id); return `<div style="position:absolute;left:${p.x}px;top:${p.y}px;width:${W}px;height:${H}px;border:1.5px solid #71717a;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px 10px;font-size:12px;line-height:1.3;${style[n.type]}">${esc(n.label)}</div>`; }).join("");
    hidden.current!.innerHTML = `<div style="position:relative;width:${w}px;height:${h}px;background:#fff;font-family:-apple-system,'Apple SD Gothic Neo',Pretendard,sans-serif;color:#18181b">
      <svg width="${w}" height="${h}" style="position:absolute;inset:0"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="18" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a1a1aa"/></marker></defs>${edges}</svg>${nodes}
      <div style="position:absolute;left:12px;top:8px;font-size:11px;color:#a1a1aa">${esc(f.name)}</div></div>`;
    const { toPng } = await import("html-to-image");
    const url = await toPng(hidden.current!.firstElementChild as HTMLElement, { pixelRatio: 2, backgroundColor: "#ffffff", width: w, height: h });
    dataUrlDownload(url, `${project.title}_${f.name}.png`);
    hidden.current!.innerHTML = "";
  }

  async function copyMermaid() {
    const res = await fetch(exp(`flow-mermaid&flowId=${flowId}`)); if (!res.ok) throw new Error("변환 실패");
    await navigator.clipboard.writeText(await res.text());
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  // ---- wireframe page PNG: load html into a same-origin (non-sandboxed scripts off) iframe and capture its document
  async function wireframePagePng(wf: WfLite, page: WireframePage) {
    const full = await api<WfLite>(`/api/projects/${pid}/wireframes/${wf.id}`);
    const html = full.pages.find((p) => p.id === page.id)?.html;
    if (!html) throw new Error("이 페이지는 아직 생성되지 않았습니다");
    const ifr = frame.current!;
    const width = wf.device === "mobile" ? 390 : 1280;
    ifr.style.width = `${width}px`; ifr.style.height = "900px";
    await new Promise<void>((resolve) => { ifr.onload = () => resolve(); ifr.srcdoc = html; });
    await new Promise((r) => setTimeout(r, 150));
    const d = ifr.contentDocument!;
    const height = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0, 400);
    ifr.style.height = `${height}px`;
    const { toPng } = await import("html-to-image");
    const url = await toPng(d.documentElement, { width, height, pixelRatio: 2, backgroundColor: "#ffffff" });
    dataUrlDownload(url, `${wf.name}_${page.name}.png`);
    ifr.srcdoc = "";
  }

  const wf = wfs.find((w) => w.id === wfId);

  return (
    <Dialog title="내보내기" onClose={onClose} wide>
      <div className="flex gap-1 mb-4 border-b">
        {([["features", "기능명세서"], ["flow", "유저플로우"], ["wireframe", "와이어프레임"]] as const).map(([k, l]) => (
          <button key={k} className={clsx("px-3 py-1.5 text-sm -mb-px border-b-2", doc === k ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-fg")} onClick={() => setDoc(k)}>{l}</button>
        ))}
      </div>

      {doc === "features" && (
        <div className="grid grid-cols-2 gap-2">
          <ExportButton busy={busy} k="xlsx" icon={FileSpreadsheet} label="엑셀 (.xlsx)" hint="시트: PRD · 기능명세서 (슬롯 9개 열 포함)" onClick={() => download(exp("features-xlsx"))} />
          <ExportButton busy={busy} k="md" icon={FileCode2} label="마크다운 (.md)" hint="PRD + 기능명세서 트리" onClick={() => download(exp("features-md"))} />
          <ExportButton busy={busy} k="txt" icon={FileText} label="텍스트 (.txt)" hint="서식 없는 일반 텍스트" onClick={() => download(exp("features-txt"))} />
          <ExportButton busy={busy} k="png" icon={ImageIcon} label="이미지 (.png)" hint="문서 전체를 한 장으로 렌더링" onClick={() => run("png", featuresPng)} />
        </div>
      )}

      {doc === "flow" && (
        !flows.length ? <div className="text-sm text-muted py-6 text-center">내보낼 유저플로우가 없습니다.</div> : (
          <div className="space-y-3">
            <select className="input" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.nodes} 노드)</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <ExportButton busy={busy} k="flowpng" icon={ImageIcon} label="이미지 (.png)" hint="노드 위치 기준 단순화 렌더링" onClick={() => run("flowpng", flowPng)} disabled={!flowId} />
              <ExportButton busy={busy} k="mmd" icon={GitBranch} label="Mermaid (.mmd)" hint="flowchart LR · 노드 타입별 도형" onClick={() => download(exp(`flow-mermaid&flowId=${flowId}`))} disabled={!flowId} />
              <ExportButton busy={busy} k="copy" icon={copied ? Check : Copy} label={copied ? "복사됨" : "Mermaid 클립보드 복사"} hint="Notion · GitHub · mermaid.live에 바로 붙여넣기" onClick={() => run("copy", copyMermaid)} disabled={!flowId} />
            </div>
          </div>
        )
      )}

      {doc === "wireframe" && (
        !wfs.length ? <div className="text-sm text-muted py-6 text-center">내보낼 와이어프레임이 없습니다.</div> : (
          <div className="space-y-3">
            <select className="input" value={wfId} onChange={(e) => setWfId(e.target.value)}>
              {wfs.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.pages.length}p)</option>)}
            </select>
            <ExportButton busy={busy} k="html" icon={LayoutTemplate} label="단일 HTML (.html)" hint="페이지 네비게이션 + 모든 페이지를 한 파일에 (클릭 이동)" onClick={() => download(exp(`wireframe-html&wfId=${wfId}`))} disabled={!wfId} />
            {wf && (
              <div className="card divide-y max-h-56 overflow-y-auto">
                {[...wf.pages].sort((a, b) => a.order - b.order).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-muted">{p.status === "done" ? "" : p.status === "error" ? "오류" : "생성 전"}</span>
                    <button className="btn btn-sm" disabled={busy !== null || p.status !== "done"} onClick={() => run(`png:${p.id}`, () => wireframePagePng(wf, p))}>
                      {busy === `png:${p.id}` ? <Spinner /> : <ImageIcon size={12} />} PNG 저장
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted">Figma 내보내기는 로컬 버전에서 지원하지 않습니다. HTML 파일을 브라우저로 열어 확인하거나 PNG를 Figma에 붙여넣으세요.</p>
          </div>
        )
      )}

      {msg && <div className="text-xs text-danger mt-3">{msg}</div>}

      {/* offscreen render targets for client-side PNG export */}
      <div className="fixed -left-[20000px] top-0 pointer-events-none" aria-hidden>
        <div ref={hidden} />
        <iframe ref={frame} title="export-frame" sandbox="allow-same-origin" style={{ border: 0, width: 1280, height: 900, background: "#fff" }} />
      </div>
      <style>{`
        .pf-print { width: 860px; padding: 40px 48px; background: #fff; color: #18181b; font-family: -apple-system, "Apple SD Gothic Neo", Pretendard, sans-serif; font-size: 13px; line-height: 1.6; }
        .pf-print h1 { font-size: 22px; margin: 0 0 16px; } .pf-print h2 { font-size: 16px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e4e4e7; }
        .pf-print h3 { font-size: 14px; margin: 14px 0 4px; } .pf-print h4 { font-size: 13px; margin: 10px 0 2px; color: #3f3f46; }
        .pf-print ul { margin: 2px 0 6px; padding-left: 18px; } .pf-print p { margin: 4px 0; } .pf-print code { font-size: 11px; color: #71717a; }
      `}</style>
    </Dialog>
  );
}
