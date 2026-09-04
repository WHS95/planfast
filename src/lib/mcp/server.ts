/**
 * PlanFast MCP server: exposes projects/PRD/features/IA/flows/wireframes/versions/activity as tools
 * and a `planfast://project/{id}` resource. One fresh instance per HTTP request (stateless).
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { projects, items, pages, flows, wireframes, versions, activity } from "@/lib/repo";
import { prdToMarkdown, itemsToMarkdown, projectContext } from "@/lib/ai/context";
import { ITEM_TYPES, PRIORITIES, STATUSES, PARENT_ITEM_TYPE, type Item, type ItemType } from "@/lib/types";

const ACTOR = "mcp";
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

function requireProject(id: string) {
  const p = projects.get(id);
  if (!p) throw new Error(`프로젝트를 찾을 수 없습니다: ${id}`);
  return p;
}
function itemTree(list: Item[]) {
  const byParent = new Map<string | null, Item[]>();
  for (const it of list) byParent.set(it.parentId, [...(byParent.get(it.parentId) ?? []), it]);
  const build = (pid: string | null): unknown[] => (byParent.get(pid) ?? []).sort((a, b) => a.order - b.order).map((it) => ({
    id: it.id, type: it.type, title: it.title, description: it.description, priority: it.priority, status: it.status, data: it.data, children: build(it.id),
  }));
  return build(null);
}

export const TOOL_DOCS: { name: string; desc: string }[] = [
  { name: "list_projects", desc: "프로젝트 목록 (id, 제목, 설명, 수정일)" },
  { name: "create_project", desc: "새 프로젝트 생성" },
  { name: "get_project", desc: "프로젝트 제목·설명·PRD 마크다운" },
  { name: "get_prd", desc: "PRD 마크다운 + 섹션/필드 id" },
  { name: "update_prd_field", desc: "PRD 필드 내용 수정 (섹션 key/제목 + 필드 라벨)" },
  { name: "get_features", desc: "기능명세서 (markdown 또는 json, id 포함)" },
  { name: "create_item", desc: "요구사항/기능/상세기능 항목 생성" },
  { name: "update_item", desc: "항목 수정 (title/description/priority/status/data)" },
  { name: "update_item_status", desc: "항목 상태 변경" },
  { name: "delete_item", desc: "항목 삭제 (하위 포함)" },
  { name: "get_pages", desc: "정보구조도 페이지 트리" },
  { name: "get_flows", desc: "유저플로우 노드/엣지" },
  { name: "get_wireframes", desc: "와이어프레임 목록 + 페이지 이름" },
  { name: "get_wireframe_page", desc: "와이어프레임 페이지 HTML" },
  { name: "list_versions", desc: "버전 목록" },
  { name: "create_version", desc: "현재 상태를 버전으로 저장" },
  { name: "get_activity", desc: "최근 작업 로그" },
];

export function createPlanfastServer() {
  const server = new McpServer({ name: "planfast", version: "0.1.0" });
  const pid = z.string().describe("프로젝트 id (list_projects 참고)");

  server.registerTool("list_projects", { description: "PlanFast 프로젝트 목록을 반환합니다.", inputSchema: {} }, async () =>
    json(projects.list().map((p) => ({ id: p.id, title: p.title, description: p.description, updatedAt: p.updatedAt }))));

  server.registerTool("create_project", { description: "새 프로젝트를 만듭니다.", inputSchema: { title: z.string(), description: z.string().optional() } }, async ({ title, description }) => {
    const p = projects.create({ title, description });
    activity.log(p.id, "project.create", p.title, {}, ACTOR);
    return json({ id: p.id, title: p.title });
  });

  server.registerTool("get_project", { description: "프로젝트 제목·설명·PRD를 마크다운으로 반환합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    const p = requireProject(projectId);
    return text([`# ${p.title}`, p.description ? `> ${p.description}` : "", "", prdToMarkdown(p.prd)].join("\n"));
  });

  server.registerTool("get_prd", { description: "PRD 마크다운과 섹션/필드 id 목록을 반환합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    const p = requireProject(projectId);
    const ids = p.prd.sections.map((s) => ({ sectionId: s.id, key: s.key, title: s.title, fields: s.fields.map((f) => ({ fieldId: f.id, label: f.label, hasContent: !!(f.content?.trim() || f.values?.length) })) }));
    return text(prdToMarkdown(p.prd, p.title) + "\n\n```json\n" + JSON.stringify(ids, null, 2) + "\n```");
  });

  server.registerTool("update_prd_field", {
    description: "PRD 필드의 내용을 수정합니다. 섹션은 key(overview/problem/target/success/attributes) 또는 제목으로, 필드는 라벨로 찾습니다. 없는 필드는 해당 섹션에 새로 추가합니다.",
    inputSchema: { projectId: pid, sectionKeyOrTitle: z.string(), fieldLabel: z.string(), content: z.string() },
  }, async ({ projectId, sectionKeyOrTitle, fieldLabel, content }) => {
    const p = requireProject(projectId);
    const prd = structuredClone(p.prd);
    const sec = prd.sections.find((s) => s.key === sectionKeyOrTitle || s.title === sectionKeyOrTitle || s.id === sectionKeyOrTitle);
    if (!sec) return fail(`섹션을 찾을 수 없습니다: ${sectionKeyOrTitle}. 사용 가능: ${prd.sections.map((s) => `${s.key}(${s.title})`).join(", ")}`);
    let f = sec.fields.find((x) => x.label === fieldLabel || x.id === fieldLabel);
    let created = false;
    if (!f) { f = { id: Math.random().toString(36).slice(2, 10), label: fieldLabel, content: "" }; sec.fields.push(f); created = true; }
    if (f.values) f.values = content.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    else f.content = content;
    projects.update(projectId, { prd });
    activity.log(projectId, "prd.update", `${sec.title} › ${f.label}`, { via: "mcp", created }, ACTOR);
    return json({ ok: true, sectionId: sec.id, fieldId: f.id, created });
  });

  server.registerTool("get_features", {
    description: "기능명세서(요구사항→기능→상세기능)를 반환합니다. json 형식은 id·data를 포함한 트리입니다.",
    inputSchema: { projectId: pid, format: z.enum(["markdown", "json"]).default("markdown") },
  }, async ({ projectId, format }) => {
    requireProject(projectId);
    const list = items.list(projectId);
    return format === "json" ? json(itemTree(list)) : text(itemsToMarkdown(list, { withIds: true }));
  });

  server.registerTool("create_item", {
    description: "기능명세서 항목을 만듭니다. requirement는 parentId 없음, feature는 requirement 아래, spec은 feature 아래여야 합니다.",
    inputSchema: {
      projectId: pid, type: z.enum(ITEM_TYPES), parentId: z.string().optional(), title: z.string(), description: z.string().optional(),
      priority: z.enum(PRIORITIES).optional(), status: z.enum(STATUSES).optional(),
      data: z.record(z.string(), z.unknown()).optional().describe("requirement: {acceptance:[{id,text,done}]}, feature: {roles,rationale,successCriteria}, spec: {slots:{precondition,trigger,action,result,exception,display,permission,business_rule,data}}"),
    },
  }, async ({ projectId, type, parentId, title, description, priority, status, data }) => {
    requireProject(projectId);
    const need = PARENT_ITEM_TYPE[type as ItemType];
    if (need === null && parentId) return fail("요구사항은 상위 항목을 가질 수 없습니다");
    if (need) {
      if (!parentId) return fail(`${type} 항목은 parentId(${need})가 필요합니다`);
      const parent = items.get(parentId);
      if (!parent || parent.projectId !== projectId) return fail("상위 항목을 찾을 수 없습니다");
      if (parent.type !== need) return fail(`상위 항목 유형이 ${need}이어야 합니다 (현재 ${parent.type})`);
    }
    const it = items.create({ projectId, type, parentId: parentId ?? null, title, description, priority, status, data: data as Partial<Item["data"]> | undefined });
    activity.log(projectId, "item.create", it.title, { itemId: it.id, type: it.type }, ACTOR);
    return json({ id: it.id, type: it.type, title: it.title, parentId: it.parentId });
  });

  server.registerTool("update_item", {
    description: "항목의 title/description/priority/status/data를 수정합니다 (부분 패치).",
    inputSchema: {
      projectId: pid, itemId: z.string(),
      patch: z.object({ title: z.string().optional(), description: z.string().optional(), priority: z.enum(PRIORITIES).optional(), status: z.enum(STATUSES).optional(), data: z.record(z.string(), z.unknown()).optional() }),
    },
  }, async ({ projectId, itemId, patch }) => {
    requireProject(projectId);
    const cur = items.get(itemId);
    if (!cur || cur.projectId !== projectId) return fail("항목을 찾을 수 없습니다");
    const it = items.update(itemId, { ...patch, data: patch.data as Partial<Item["data"]> | undefined })!;
    activity.log(projectId, "item.update", it.title, { itemId, fields: Object.keys(patch) }, ACTOR);
    return json({ id: it.id, title: it.title, status: it.status, priority: it.priority });
  });

  server.registerTool("update_item_status", { description: "항목 상태를 변경합니다.", inputSchema: { projectId: pid, itemId: z.string(), status: z.enum(STATUSES) } }, async ({ projectId, itemId, status }) => {
    requireProject(projectId);
    const cur = items.get(itemId);
    if (!cur || cur.projectId !== projectId) return fail("항목을 찾을 수 없습니다");
    const it = items.update(itemId, { status })!;
    activity.log(projectId, "item.update", it.title, { itemId, status }, ACTOR);
    return json({ id: it.id, status: it.status });
  });

  server.registerTool("delete_item", { description: "항목을 하위 항목과 함께 삭제합니다.", inputSchema: { projectId: pid, itemId: z.string() } }, async ({ projectId, itemId }) => {
    requireProject(projectId);
    const cur = items.get(itemId);
    if (!cur || cur.projectId !== projectId) return fail("항목을 찾을 수 없습니다");
    const removed = items.remove(itemId);
    activity.log(projectId, "item.delete", cur.title, { itemId, removed: removed.length }, ACTOR);
    return json({ ok: true, removed: removed.length });
  });

  server.registerTool("get_pages", { description: "정보구조도 페이지 트리를 반환합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    requireProject(projectId);
    const ps = pages.list(projectId);
    const build = (parent: string | null): unknown[] => ps.filter((p) => p.parentId === parent).map((p) => ({ id: p.id, name: p.name, description: p.description, linkedSpecIds: p.linkedSpecIds, children: build(p.id) }));
    return json(build(null));
  });

  server.registerTool("get_flows", { description: "유저플로우 목록(노드/엣지)을 반환합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    requireProject(projectId);
    return json(flows.list(projectId).map((f) => ({ id: f.id, name: f.name, request: f.request, nodes: f.nodes, edges: f.edges })));
  });

  server.registerTool("get_wireframes", { description: "와이어프레임 목록과 페이지 이름을 반환합니다. HTML은 get_wireframe_page로 조회합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    requireProject(projectId);
    return json(wireframes.list(projectId).map((w) => ({ id: w.id, name: w.name, device: w.device, flowId: w.flowId, pages: wireframes.pages(w.id).map((p) => ({ id: p.id, name: p.name, status: p.status })) })));
  });

  server.registerTool("get_wireframe_page", { description: "와이어프레임 페이지의 HTML을 반환합니다.", inputSchema: { pageId: z.string() } }, async ({ pageId }) => {
    const p = wireframes.getPage(pageId);
    if (!p) return fail("페이지를 찾을 수 없습니다");
    return text(p.html || "(아직 생성되지 않았습니다)");
  });

  server.registerTool("list_versions", { description: "버전 목록을 반환합니다.", inputSchema: { projectId: pid } }, async ({ projectId }) => {
    requireProject(projectId);
    return json(versions.list(projectId).map((v) => ({ id: v.id, name: v.name, auto: v.auto, createdAt: v.createdAt })));
  });

  server.registerTool("create_version", { description: "현재 프로젝트 상태를 버전으로 저장합니다.", inputSchema: { projectId: pid, name: z.string() } }, async ({ projectId, name }) => {
    requireProject(projectId);
    const v = versions.create(projectId, name, false);
    activity.log(projectId, "version.create", name, { versionId: v.id }, ACTOR);
    return json({ id: v.id, name: v.name, createdAt: v.createdAt });
  });

  server.registerTool("get_activity", { description: "최근 작업 로그를 반환합니다.", inputSchema: { projectId: pid, limit: z.number().int().min(1).max(500).default(50) } }, async ({ projectId, limit }) => {
    requireProject(projectId);
    return json(activity.list(projectId, limit).map((a) => ({ actor: a.actor, action: a.action, target: a.target, at: a.createdAt })));
  });

  server.registerResource("project", new ResourceTemplate("planfast://project/{id}", {
    list: async () => ({ resources: projects.list().map((p) => ({ uri: `planfast://project/${p.id}`, name: p.title, mimeType: "text/markdown" })) }),
  }), { title: "PlanFast 프로젝트", description: "프로젝트 전체 컨텍스트(PRD·기능명세서·IA·플로우) 마크다운", mimeType: "text/markdown" }, async (uri, { id }) => {
    const { text: body } = projectContext(String(id), { withIds: true, includeFlows: true, includePages: true });
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: body }] };
  });

  return server;
}
