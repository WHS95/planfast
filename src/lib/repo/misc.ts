import { all, get, run, tx, j, bool } from "@/lib/db";
import {
  now, rid, defaultAppSettings,
  type Page, type Flow, type FlowNode, type FlowEdge, type FlowFrame, type MessageStatus, type Wireframe, type WireframePage, type Device,
  type Chat, type ChatMessage, type Review, type ReviewItem, type ReviewPerspective, type Meeting, type Decision,
  type Version, type ProjectSnapshot, type Activity, type Comment, type ShareLink, type ApiKey, type Attachment, type AppSettings,
} from "@/lib/types";
import { projects } from "./projects";
import { items } from "./items";

type R = Record<string, unknown>;
const s = (v: unknown) => (v as string) ?? "";

// ---------------- pages (IA) ----------------
const mapPage = (r: R): Page => ({
  id: s(r.id), projectId: s(r.project_id), parentId: (r.parent_id as string) ?? null, order: r.order as number,
  name: s(r.name), description: s(r.description), linkedSpecIds: j<string[]>(r.linked_spec_ids, []),
  createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});
export const pages = {
  list: (projectId: string) => all('SELECT * FROM pages WHERE project_id=? ORDER BY "order", created_at', projectId).map(mapPage),
  get: (id: string) => { const r = get("SELECT * FROM pages WHERE id=?", id); return r ? mapPage(r) : undefined; },
  create(input: { projectId: string; parentId?: string | null; name: string; description?: string; linkedSpecIds?: string[]; order?: number }): Page {
    const id = rid(); const t = now();
    const order = input.order ?? ((get<{ m: number | null }>('SELECT MAX("order") m FROM pages WHERE project_id=? AND parent_id IS ?', input.projectId, input.parentId ?? null)?.m ?? -1) + 1);
    run('INSERT INTO pages (id,project_id,parent_id,"order",name,description,linked_spec_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, input.projectId, input.parentId ?? null, order, input.name, input.description ?? "", JSON.stringify(input.linkedSpecIds ?? []), t, t);
    projects.touch(input.projectId);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Page, "parentId" | "order" | "name" | "description" | "linkedSpecIds">>): Page | undefined {
    const cur = this.get(id); if (!cur) return;
    const n = { ...cur, ...patch };
    run('UPDATE pages SET parent_id=?, "order"=?, name=?, description=?, linked_spec_ids=?, updated_at=? WHERE id=?',
      n.parentId, n.order, n.name, n.description, JSON.stringify(n.linkedSpecIds), now(), id);
    projects.touch(cur.projectId);
    return this.get(id);
  },
  remove(id: string) {
    const cur = this.get(id); if (!cur) return;
    const list = this.list(cur.projectId); const del = new Set([id]); let ch = true;
    while (ch) { ch = false; for (const p of list) if (p.parentId && del.has(p.parentId) && !del.has(p.id)) { del.add(p.id); ch = true; } }
    tx(() => { for (const d of del) run("DELETE FROM pages WHERE id=?", d); });
    projects.touch(cur.projectId);
  },
  reorder(projectId: string, parentId: string | null, orderedIds: string[]) {
    tx(() => orderedIds.forEach((id, i) => run('UPDATE pages SET "order"=?, parent_id=?, updated_at=? WHERE id=? AND project_id=?', i, parentId, now(), id, projectId)));
    projects.touch(projectId);
  },
};

// ---------------- flows ----------------
const mapFlow = (r: R): Flow => ({
  id: s(r.id), projectId: s(r.project_id), name: s(r.name), request: s(r.request),
  nodes: j<FlowNode[]>(r.nodes, []), edges: j<FlowEdge[]>(r.edges, []), frames: j<FlowFrame[]>(r.frames, []), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});
export const flows = {
  list: (projectId: string) => all("SELECT * FROM flows WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapFlow),
  get: (id: string) => { const r = get("SELECT * FROM flows WHERE id=?", id); return r ? mapFlow(r) : undefined; },
  create(input: { projectId: string; name: string; request?: string; nodes?: FlowNode[]; edges?: FlowEdge[]; frames?: FlowFrame[] }): Flow {
    const id = rid(); const t = now();
    run("INSERT INTO flows (id,project_id,name,request,nodes,edges,frames,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id, input.projectId, input.name, input.request ?? "", JSON.stringify(input.nodes ?? []), JSON.stringify(input.edges ?? []), JSON.stringify(input.frames ?? []), t, t);
    projects.touch(input.projectId);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Flow, "name" | "request" | "nodes" | "edges" | "frames">>): Flow | undefined {
    const cur = this.get(id); if (!cur) return;
    const n = { ...cur, ...patch };
    run("UPDATE flows SET name=?, request=?, nodes=?, edges=?, frames=?, updated_at=? WHERE id=?", n.name, n.request, JSON.stringify(n.nodes), JSON.stringify(n.edges), JSON.stringify(n.frames), now(), id);
    projects.touch(cur.projectId);
    return this.get(id);
  },
  remove(id: string) { const cur = this.get(id); if (!cur) return; run("DELETE FROM flows WHERE id=?", id); projects.touch(cur.projectId); },
};

// ---------------- wireframes ----------------
const mapWf = (r: R): Wireframe => ({
  id: s(r.id), projectId: s(r.project_id), flowId: (r.flow_id as string) ?? null, name: s(r.name), device: r.device as Device,
  request: s(r.request), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});
const mapWfPage = (r: R): WireframePage => ({
  id: s(r.id), wireframeId: s(r.wireframe_id), order: r.order as number, name: s(r.name), sourceNodeId: (r.source_node_id as string) ?? null,
  html: s(r.html), status: r.status as WireframePage["status"], error: (r.error as string) ?? null, createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});
export const wireframes = {
  list: (projectId: string) => all("SELECT * FROM wireframes WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapWf),
  get: (id: string) => { const r = get("SELECT * FROM wireframes WHERE id=?", id); return r ? mapWf(r) : undefined; },
  create(input: { projectId: string; flowId: string | null; name: string; device: Device; request?: string }): Wireframe {
    const id = rid(); const t = now();
    run("INSERT INTO wireframes (id,project_id,flow_id,name,device,request,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      id, input.projectId, input.flowId, input.name, input.device, input.request ?? "", t, t);
    projects.touch(input.projectId);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Wireframe, "name" | "request" | "device">>) {
    const cur = this.get(id); if (!cur) return; const n = { ...cur, ...patch };
    run("UPDATE wireframes SET name=?, request=?, device=?, updated_at=? WHERE id=?", n.name, n.request, n.device, now(), id);
    return this.get(id);
  },
  remove(id: string) { run("DELETE FROM wireframe_pages WHERE wireframe_id=?", id); run("DELETE FROM wireframes WHERE id=?", id); },
  pages: (wireframeId: string) => all('SELECT * FROM wireframe_pages WHERE wireframe_id=? ORDER BY "order"', wireframeId).map(mapWfPage),
  getPage: (id: string) => { const r = get("SELECT * FROM wireframe_pages WHERE id=?", id); return r ? mapWfPage(r) : undefined; },
  addPage(input: { wireframeId: string; name: string; sourceNodeId?: string | null; order?: number; html?: string; status?: WireframePage["status"] }): WireframePage {
    const id = rid(); const t = now();
    const order = input.order ?? ((get<{ m: number | null }>('SELECT MAX("order") m FROM wireframe_pages WHERE wireframe_id=?', input.wireframeId)?.m ?? -1) + 1);
    run('INSERT INTO wireframe_pages (id,wireframe_id,"order",name,source_node_id,html,status,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, input.wireframeId, order, input.name, input.sourceNodeId ?? null, input.html ?? "", input.status ?? "pending", null, t, t);
    return this.getPage(id)!;
  },
  updatePage(id: string, patch: Partial<Pick<WireframePage, "name" | "order" | "html" | "status" | "error">>) {
    const cur = this.getPage(id); if (!cur) return; const n = { ...cur, ...patch };
    run('UPDATE wireframe_pages SET name=?, "order"=?, html=?, status=?, error=?, updated_at=? WHERE id=?', n.name, n.order, n.html, n.status, n.error, now(), id);
    return this.getPage(id);
  },
  removePage(id: string) { run("DELETE FROM wireframe_pages WHERE id=?", id); },
};

// ---------------- chats ----------------
const mapChat = (r: R): Chat => ({ id: s(r.id), projectId: s(r.project_id), title: s(r.title), createdAt: s(r.created_at) });
const mapMsg = (r: R): ChatMessage => ({
  id: s(r.id), chatId: s(r.chat_id), role: r.role as ChatMessage["role"], content: s(r.content),
  mentions: j(r.mentions, []), attachments: j(r.attachments, []), proposals: j(r.proposals, []),
  status: ((r.status as string) || "done") as MessageStatus, createdAt: s(r.created_at),
});
export const chats = {
  list: (projectId: string) => all("SELECT * FROM chats WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapChat),
  get: (id: string) => { const r = get("SELECT * FROM chats WHERE id=?", id); return r ? mapChat(r) : undefined; },
  create(projectId: string, title = "새 채팅"): Chat { const id = rid(); run("INSERT INTO chats (id,project_id,title,created_at) VALUES (?,?,?,?)", id, projectId, title, now()); return this.get(id)!; },
  rename(id: string, title: string) { run("UPDATE chats SET title=? WHERE id=?", title, id); },
  remove(id: string) { run("DELETE FROM messages WHERE chat_id=?", id); run("DELETE FROM chats WHERE id=?", id); },
  messages: (chatId: string) => all("SELECT * FROM messages WHERE chat_id=? ORDER BY created_at", chatId).map(mapMsg),
  addMessage(input: Omit<ChatMessage, "id" | "createdAt" | "status"> & { id?: string; status?: MessageStatus }): ChatMessage {
    const id = input.id ?? rid();
    run("INSERT INTO messages (id,chat_id,role,content,mentions,attachments,proposals,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id, input.chatId, input.role, input.content, JSON.stringify(input.mentions ?? []), JSON.stringify(input.attachments ?? []), JSON.stringify(input.proposals ?? []), input.status ?? "done", now());
    return get("SELECT * FROM messages WHERE id=?", id) ? mapMsg(get("SELECT * FROM messages WHERE id=?", id)!) : (undefined as never);
  },
  updateMessage(id: string, patch: Partial<Pick<ChatMessage, "content" | "proposals" | "status">>) {
    const r = get("SELECT * FROM messages WHERE id=?", id); if (!r) return; const cur = mapMsg(r); const n = { ...cur, ...patch };
    run("UPDATE messages SET content=?, proposals=?, status=? WHERE id=?", n.content, JSON.stringify(n.proposals), n.status, id);
    return mapMsg(get("SELECT * FROM messages WHERE id=?", id)!);
  },
};

// ---------------- reviews ----------------
const mapReview = (r: R): Review => ({ id: s(r.id), projectId: s(r.project_id), perspectives: j(r.perspectives, []), status: r.status as Review["status"], createdAt: s(r.created_at) });
const mapReviewItem = (r: R): ReviewItem => ({
  id: s(r.id), reviewId: s(r.review_id), projectId: s(r.project_id), perspective: r.perspective as ReviewPerspective, severity: r.severity as ReviewItem["severity"],
  target: s(r.target), targetLabel: s(r.target_label), title: s(r.title), body: s(r.body), status: r.status as ReviewItem["status"], createdAt: s(r.created_at),
});
export const reviews = {
  latest: (projectId: string) => { const r = get("SELECT * FROM reviews WHERE project_id=? ORDER BY created_at DESC LIMIT 1", projectId); return r ? mapReview(r) : undefined; },
  get: (id: string) => { const r = get("SELECT * FROM reviews WHERE id=?", id); return r ? mapReview(r) : undefined; },
  create(projectId: string, perspectives: ReviewPerspective[]): Review { const id = rid(); run("INSERT INTO reviews (id,project_id,perspectives,status,created_at) VALUES (?,?,?,?,?)", id, projectId, JSON.stringify(perspectives), "running", now()); return this.get(id)!; },
  setStatus(id: string, status: Review["status"]) { run("UPDATE reviews SET status=? WHERE id=?", status, id); },
  items: (reviewId: string) => all("SELECT * FROM review_items WHERE review_id=? ORDER BY created_at", reviewId).map(mapReviewItem),
  addItem(input: Omit<ReviewItem, "id" | "createdAt" | "status">): ReviewItem {
    const id = rid();
    run("INSERT INTO review_items (id,review_id,project_id,perspective,severity,target,target_label,title,body,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id, input.reviewId, input.projectId, input.perspective, input.severity, input.target, input.targetLabel, input.title, input.body, "open", now());
    return mapReviewItem(get("SELECT * FROM review_items WHERE id=?", id)!);
  },
  setItemStatus(id: string, status: ReviewItem["status"]) { run("UPDATE review_items SET status=? WHERE id=?", status, id); },
};

// ---------------- meetings / decisions (기획실) ----------------
const mapMeeting = (r: R): Meeting => ({ id: s(r.id), projectId: (r.project_id as string) ?? null, title: s(r.title), content: s(r.content), heldAt: s(r.held_at), createdAt: s(r.created_at), updatedAt: s(r.updated_at) });
const mapDecision = (r: R): Decision => ({ id: s(r.id), meetingId: s(r.meeting_id), projectId: (r.project_id as string) ?? null, text: s(r.text), rationale: s(r.rationale), status: r.status as Decision["status"], applied: bool(r.applied), createdAt: s(r.created_at) });
export const meetings = {
  list: (projectId?: string | null) => (projectId ? all("SELECT * FROM meetings WHERE project_id=? ORDER BY held_at DESC", projectId) : all("SELECT * FROM meetings ORDER BY held_at DESC")).map(mapMeeting),
  get: (id: string) => { const r = get("SELECT * FROM meetings WHERE id=?", id); return r ? mapMeeting(r) : undefined; },
  create(input: { projectId?: string | null; title: string; content?: string; heldAt?: string }): Meeting {
    const id = rid(); const t = now();
    run("INSERT INTO meetings (id,project_id,title,content,held_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", id, input.projectId ?? null, input.title, input.content ?? "", input.heldAt ?? t, t, t);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Meeting, "projectId" | "title" | "content" | "heldAt">>) {
    const cur = this.get(id); if (!cur) return; const n = { ...cur, ...patch };
    run("UPDATE meetings SET project_id=?, title=?, content=?, held_at=?, updated_at=? WHERE id=?", n.projectId, n.title, n.content, n.heldAt, now(), id);
    return this.get(id);
  },
  remove(id: string) { run("DELETE FROM decisions WHERE meeting_id=?", id); run("DELETE FROM meetings WHERE id=?", id); },
  decisions: (meetingId: string) => all("SELECT * FROM decisions WHERE meeting_id=? ORDER BY created_at", meetingId).map(mapDecision),
  addDecision(input: { meetingId: string; projectId?: string | null; text: string; rationale?: string; status?: Decision["status"] }): Decision {
    const id = rid();
    run("INSERT INTO decisions (id,meeting_id,project_id,text,rationale,status,applied,created_at) VALUES (?,?,?,?,?,?,?,?)", id, input.meetingId, input.projectId ?? null, input.text, input.rationale ?? "", input.status ?? "undecided", 0, now());
    return mapDecision(get("SELECT * FROM decisions WHERE id=?", id)!);
  },
  updateDecision(id: string, patch: Partial<Pick<Decision, "text" | "rationale" | "status" | "applied">>) {
    const r = get("SELECT * FROM decisions WHERE id=?", id); if (!r) return; const n = { ...mapDecision(r), ...patch };
    run("UPDATE decisions SET text=?, rationale=?, status=?, applied=? WHERE id=?", n.text, n.rationale, n.status, n.applied ? 1 : 0, id);
    return mapDecision(get("SELECT * FROM decisions WHERE id=?", id)!);
  },
  removeDecision(id: string) { run("DELETE FROM decisions WHERE id=?", id); },
};

// ---------------- versions ----------------
const mapVersion = (r: R): Version => ({ id: s(r.id), projectId: s(r.project_id), name: s(r.name), auto: bool(r.auto), snapshot: j(r.snapshot, {} as ProjectSnapshot), createdAt: s(r.created_at) });
export function snapshotProject(projectId: string): ProjectSnapshot {
  const p = projects.get(projectId)!;
  return { project: { title: p.title, description: p.description, prd: p.prd, settings: p.settings }, items: items.list(projectId), pages: pages.list(projectId), flows: flows.list(projectId) };
}
export const versions = {
  list: (projectId: string) => all("SELECT id,project_id,name,auto,created_at,'{}' AS snapshot FROM versions WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapVersion),
  get: (id: string) => { const r = get("SELECT * FROM versions WHERE id=?", id); return r ? mapVersion(r) : undefined; },
  create(projectId: string, name: string, auto = false): Version {
    const id = rid();
    run("INSERT INTO versions (id,project_id,name,auto,snapshot,created_at) VALUES (?,?,?,?,?,?)", id, projectId, name, auto ? 1 : 0, JSON.stringify(snapshotProject(projectId)), now());
    if (auto) { // keep last 30 auto versions
      const olds = all<{ id: string }>("SELECT id FROM versions WHERE project_id=? AND auto=1 ORDER BY created_at DESC LIMIT -1 OFFSET 30", projectId);
      for (const o of olds) run("DELETE FROM versions WHERE id=?", o.id);
    }
    return this.get(id)!;
  },
  restore(id: string) {
    const v = this.get(id); if (!v) return;
    const snap = v.snapshot;
    tx(() => {
      this.create(v.projectId, `복원 전 자동 저장 (${new Date().toLocaleString("ko-KR")})`, true);
      projects.update(v.projectId, { title: snap.project.title, description: snap.project.description, prd: snap.project.prd, settings: snap.project.settings });
      run("DELETE FROM items WHERE project_id=?", v.projectId);
      for (const it of snap.items) run('INSERT INTO items (id,project_id,type,parent_id,"order",title,description,priority,status,data,ai_proposed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        it.id, v.projectId, it.type, it.parentId, it.order, it.title, it.description, it.priority, it.status, JSON.stringify(it.data), it.aiProposed ? 1 : 0, it.createdAt, it.updatedAt);
      run("DELETE FROM pages WHERE project_id=?", v.projectId);
      for (const p of snap.pages) run('INSERT INTO pages (id,project_id,parent_id,"order",name,description,linked_spec_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        p.id, v.projectId, p.parentId, p.order, p.name, p.description, JSON.stringify(p.linkedSpecIds), p.createdAt, p.updatedAt);
      run("DELETE FROM flows WHERE project_id=?", v.projectId);
      for (const f of snap.flows) run("INSERT INTO flows (id,project_id,name,request,nodes,edges,frames,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        f.id, v.projectId, f.name, f.request, JSON.stringify(f.nodes), JSON.stringify(f.edges), JSON.stringify(f.frames ?? []), f.createdAt, f.updatedAt);
    });
  },
  remove(id: string) { run("DELETE FROM versions WHERE id=?", id); },
};

// ---------------- activity log ----------------
const mapAct = (r: R): Activity => ({ id: s(r.id), projectId: s(r.project_id), actor: s(r.actor), action: s(r.action), target: s(r.target), detail: j(r.detail, {}), createdAt: s(r.created_at) });
export const activity = {
  list: (projectId: string, limit = 200) => all("SELECT * FROM activity WHERE project_id=? ORDER BY created_at DESC LIMIT ?", projectId, limit).map(mapAct),
  log(projectId: string, action: string, target: string, detail: Record<string, unknown> = {}, actor = "user") {
    run("INSERT INTO activity (id,project_id,actor,action,target,detail,created_at) VALUES (?,?,?,?,?,?,?)", rid(), projectId, actor, action, target, JSON.stringify(detail), now());
  },
};

// ---------------- comments ----------------
const mapComment = (r: R): Comment => ({ id: s(r.id), projectId: s(r.project_id), target: s(r.target), x: (r.x as number) ?? null, y: (r.y as number) ?? null, body: s(r.body), resolved: bool(r.resolved), createdAt: s(r.created_at) });
export const comments = {
  list: (projectId: string, targetPrefix?: string) => (targetPrefix
    ? all("SELECT * FROM comments WHERE project_id=? AND target LIKE ? ORDER BY created_at", projectId, `${targetPrefix}%`)
    : all("SELECT * FROM comments WHERE project_id=? ORDER BY created_at", projectId)).map(mapComment),
  create(input: { projectId: string; target: string; body: string; x?: number | null; y?: number | null }): Comment {
    const id = rid();
    run("INSERT INTO comments (id,project_id,target,x,y,body,resolved,created_at) VALUES (?,?,?,?,?,?,?,?)", id, input.projectId, input.target, input.x ?? null, input.y ?? null, input.body, 0, now());
    return mapComment(get("SELECT * FROM comments WHERE id=?", id)!);
  },
  update(id: string, patch: Partial<Pick<Comment, "body" | "resolved" | "x" | "y">>) {
    const r = get("SELECT * FROM comments WHERE id=?", id); if (!r) return; const n = { ...mapComment(r), ...patch };
    run("UPDATE comments SET body=?, resolved=?, x=?, y=? WHERE id=?", n.body, n.resolved ? 1 : 0, n.x, n.y, id);
    return mapComment(get("SELECT * FROM comments WHERE id=?", id)!);
  },
  remove(id: string) { run("DELETE FROM comments WHERE id=?", id); },
};

// ---------------- share links ----------------
const mapShare = (r: R): ShareLink => ({ id: s(r.id), projectId: s(r.project_id), expiresAt: (r.expires_at as string) ?? null, disabled: bool(r.disabled), createdAt: s(r.created_at) });
export const shareLinks = {
  list: (projectId: string) => all("SELECT * FROM share_links WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapShare),
  get: (id: string) => { const r = get("SELECT * FROM share_links WHERE id=?", id); return r ? mapShare(r) : undefined; },
  create(projectId: string, expiresAt: string | null): ShareLink { const id = rid() + rid(); run("INSERT INTO share_links (id,project_id,expires_at,disabled,created_at) VALUES (?,?,?,?,?)", id, projectId, expiresAt, 0, now()); return this.get(id)!; },
  setDisabled(id: string, disabled: boolean) { run("UPDATE share_links SET disabled=? WHERE id=?", disabled ? 1 : 0, id); },
  remove(id: string) { run("DELETE FROM share_links WHERE id=?", id); },
  /** returns project id if link is valid */
  resolve(id: string): string | null {
    const l = this.get(id); if (!l || l.disabled) return null;
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return null;
    return l.projectId;
  },
};

// ---------------- api keys (MCP) ----------------
const mapKey = (r: R): ApiKey => ({ id: s(r.id), name: s(r.name), key: s(r.key), createdAt: s(r.created_at), lastUsedAt: (r.last_used_at as string) ?? null });
export const apiKeys = {
  list: () => all("SELECT * FROM api_keys ORDER BY created_at DESC").map(mapKey),
  create(name: string): ApiKey { const id = rid(); const key = "pf_sk_" + rid() + rid() + rid(); run("INSERT INTO api_keys (id,name,key,created_at,last_used_at) VALUES (?,?,?,?,NULL)", id, name, key, now()); return mapKey(get("SELECT * FROM api_keys WHERE id=?", id)!); },
  remove(id: string) { run("DELETE FROM api_keys WHERE id=?", id); },
  verify(key: string): boolean { const r = get("SELECT id FROM api_keys WHERE key=?", key); if (r) run("UPDATE api_keys SET last_used_at=? WHERE key=?", now(), key); return !!r; },
};

// ---------------- attachments ----------------
const mapAtt = (r: R): Attachment & { projectId: string; createdAt: string } => ({ id: s(r.id), projectId: s(r.project_id), name: s(r.name), mime: s(r.mime), size: r.size as number, text: s(r.text), createdAt: s(r.created_at) });
export const attachments = {
  list: (projectId: string) => all("SELECT * FROM attachments WHERE project_id=? ORDER BY created_at DESC", projectId).map(mapAtt),
  get: (id: string) => { const r = get("SELECT * FROM attachments WHERE id=?", id); return r ? mapAtt(r) : undefined; },
  create(input: { projectId: string; name: string; mime: string; size: number; text: string }) { const id = rid(); run("INSERT INTO attachments (id,project_id,name,mime,size,text,created_at) VALUES (?,?,?,?,?,?,?)", id, input.projectId, input.name, input.mime, input.size, input.text, now()); return this.get(id)!; },
  remove(id: string) { run("DELETE FROM attachments WHERE id=?", id); },
};

// ---------------- app settings ----------------
export const appSettings = {
  get(): AppSettings {
    const rows = all<{ key: string; value: string }>("SELECT key, value FROM app_settings");
    const o: Record<string, unknown> = {};
    for (const r of rows) o[r.key] = j(r.value, r.value);
    return { ...defaultAppSettings(), ...o } as AppSettings;
  },
  set(patch: Partial<AppSettings>) {
    for (const [k, v] of Object.entries(patch)) run("INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, JSON.stringify(v));
  },
};
