import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, flows, pages, wireframes, versions, activity } from "@/lib/repo";
import { featuresMarkdown, featuresText, featuresXlsx } from "@/lib/export/features";
import { flowToMermaid } from "@/lib/export/mermaid";
import { wireframeToHtml } from "@/lib/export/wireframeHtml";
import { iaXlsx } from "@/lib/export/ia";
import { screenSpecHtml } from "@/lib/export/screenSpec";
import { storyboardHtml } from "@/lib/export/storyboard";

const safe = (s: string) => s.replace(/[\\/:*?"<>|\n]+/g, " ").trim().slice(0, 80) || "export";
function file(body: BodyInit, name: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
}

/**
 * GET ?type=features-xlsx|features-md|features-txt|flow-mermaid&flowId=|wireframe-html&wfId=
 *     ?type=flows (json list for the dialog) | flow-json&flowId= | features-html (printable html for PNG)
 *     ?type=ia-xlsx (IA 구성도 엑셀) | screen-spec-html (화면설계서 전체) | storyboard-html&wfId= (유즈케이스 스토리보드)
 */
export const GET = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = projects.get(id);
  if (!p) return notFound();
  const u = new URL(req.url);
  const type = u.searchParams.get("type") ?? "";
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${safe(p.title)}_${stamp}`;

  if (type === "flows") return ok(flows.list(id).map((f) => ({ id: f.id, name: f.name, nodes: f.nodes.length })));
  if (type === "flow-json") { const f = flows.get(u.searchParams.get("flowId") ?? ""); return f && f.projectId === id ? ok(f) : notFound("flow not found"); }

  if (type.startsWith("features-")) {
    const list = items.list(id);
    activity.log(id, "export", type);
    if (type === "features-xlsx") return file(new Uint8Array(await featuresXlsx(p, list)), `${base}_기능명세서.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (type === "features-md") return file(featuresMarkdown(p, list), `${base}_기능명세서.md`, "text/markdown; charset=utf-8");
    if (type === "features-txt") return file(featuresText(p, list), `${base}_기능명세서.txt`, "text/plain; charset=utf-8");
  }
  if (type === "ia-xlsx") {
    activity.log(id, "export", type);
    return file(new Uint8Array(await iaXlsx(p, pages.list(id), items.list(id))), `${base}_IA구성도.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  if (type === "screen-spec-html") {
    activity.log(id, "export", type);
    const html = screenSpecHtml({
      project: p,
      pages: pages.list(id),
      items: items.list(id),
      flows: flows.list(id),
      wireframes: wireframes.list(id).map((wf) => ({ wf, pages: wireframes.pages(wf.id) })),
      versions: versions.list(id),
    });
    return file(html, `${base}_화면설계서.html`, "text/html; charset=utf-8");
  }
  if (type === "flow-mermaid") {
    const f = flows.get(u.searchParams.get("flowId") ?? "");
    if (!f || f.projectId !== id) return notFound("flow not found");
    activity.log(id, "export", type, { flowId: f.id });
    return file(flowToMermaid(f), `${base}_${safe(f.name)}.mmd`, "text/plain; charset=utf-8");
  }
  if (type === "storyboard-html") {
    const wf = wireframes.get(u.searchParams.get("wfId") ?? "");
    if (!wf || wf.projectId !== id) return notFound("wireframe not found");
    activity.log(id, "export", type, { wfId: wf.id });
    const pgs = wireframes.withUseCases(wf, wireframes.pages(wf.id));
    return file(storyboardHtml(p.title, wf, pgs), `${base}_${safe(wf.name)}_스토리보드.html`, "text/html; charset=utf-8");
  }
  if (type === "wireframe-html") {
    const wf = wireframes.get(u.searchParams.get("wfId") ?? "");
    if (!wf || wf.projectId !== id) return notFound("wireframe not found");
    activity.log(id, "export", type, { wfId: wf.id });
    return file(wireframeToHtml(wf, wireframes.pages(wf.id)), `${base}_${safe(wf.name)}.html`, "text/html; charset=utf-8");
  }
  return bad("unknown export type");
});
