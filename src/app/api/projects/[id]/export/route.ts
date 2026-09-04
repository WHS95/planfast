import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, items, flows, wireframes, activity } from "@/lib/repo";
import { featuresMarkdown, featuresText, featuresXlsx } from "@/lib/export/features";
import { flowToMermaid } from "@/lib/export/mermaid";
import { wireframeToHtml } from "@/lib/export/wireframeHtml";

const safe = (s: string) => s.replace(/[\\/:*?"<>|\n]+/g, " ").trim().slice(0, 80) || "export";
function file(body: BodyInit, name: string, type: string) {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
}

/**
 * GET ?type=features-xlsx|features-md|features-txt|flow-mermaid&flowId=|wireframe-html&wfId=
 *     ?type=flows (json list for the dialog) | flow-json&flowId= | features-html (printable html for PNG)
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
  if (type === "flow-mermaid") {
    const f = flows.get(u.searchParams.get("flowId") ?? "");
    if (!f || f.projectId !== id) return notFound("flow not found");
    activity.log(id, "export", type, { flowId: f.id });
    return file(flowToMermaid(f), `${base}_${safe(f.name)}.mmd`, "text/plain; charset=utf-8");
  }
  if (type === "wireframe-html") {
    const wf = wireframes.get(u.searchParams.get("wfId") ?? "");
    if (!wf || wf.projectId !== id) return notFound("wireframe not found");
    activity.log(id, "export", type, { wfId: wf.id });
    return file(wireframeToHtml(wf, wireframes.pages(wf.id)), `${base}_${safe(wf.name)}.html`, "text/html; charset=utf-8");
  }
  return bad("unknown export type");
});
