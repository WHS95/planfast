import { all, get, run, tx, j, bool } from "@/lib/db";
import { defaultPrd, defaultProjectSettings, now, rid, type Prd, type Project, type ProjectSettings } from "@/lib/types";

function map(r: Record<string, unknown>): Project {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    thumbnail: (r.thumbnail as string) ?? null,
    starred: bool(r.starred),
    deletedAt: (r.deleted_at as string) ?? null,
    prd: j<Prd>(r.prd, defaultPrd()),
    settings: { ...defaultProjectSettings(), ...j<Partial<ProjectSettings>>(r.settings, {}) },
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export const projects = {
  list(opts: { deleted?: boolean; starred?: boolean } = {}): Project[] {
    const where = opts.deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
    const star = opts.starred ? " AND starred = 1" : "";
    return all(`SELECT * FROM projects WHERE ${where}${star} ORDER BY updated_at DESC`).map(map);
  },
  get(id: string): Project | undefined {
    const r = get("SELECT * FROM projects WHERE id = ?", id);
    return r ? map(r) : undefined;
  },
  create(input: { title?: string; description?: string; prd?: Prd } = {}): Project {
    const id = rid();
    const t = now();
    run(
      "INSERT INTO projects (id,title,description,thumbnail,starred,deleted_at,prd,settings,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      id, input.title ?? "새 프로젝트", input.description ?? "", null, 0, null,
      JSON.stringify(input.prd ?? defaultPrd()), JSON.stringify(defaultProjectSettings()), t, t,
    );
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Project, "title" | "description" | "thumbnail" | "starred" | "prd" | "settings">>): Project | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    run(
      "UPDATE projects SET title=?, description=?, thumbnail=?, starred=?, prd=?, settings=?, updated_at=? WHERE id=?",
      next.title, next.description, next.thumbnail, next.starred ? 1 : 0,
      JSON.stringify(next.prd), JSON.stringify(next.settings), now(), id,
    );
    void import("./autosnapshot").then((m) => m.maybeAutoSnapshot(id));
    return this.get(id);
  },
  touch(id: string) {
    run("UPDATE projects SET updated_at=? WHERE id=?", now(), id);
    void import("./autosnapshot").then((m) => m.maybeAutoSnapshot(id));
  },
  softDelete(id: string) {
    run("UPDATE projects SET deleted_at=? WHERE id=?", now(), id);
  },
  restore(id: string) {
    run("UPDATE projects SET deleted_at=NULL WHERE id=?", id);
  },
  hardDelete(id: string) {
    tx(() => {
      for (const t of ["items", "pages", "flows", "reviews", "review_items", "versions", "activity", "comments", "share_links", "attachments", "chats"]) {
        run(`DELETE FROM ${t} WHERE project_id=?`, id);
      }
      run("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE project_id=?)", id);
      run("DELETE FROM wireframe_pages WHERE wireframe_id IN (SELECT id FROM wireframes WHERE project_id=?)", id);
      run("DELETE FROM wireframes WHERE project_id=?", id);
      run("DELETE FROM projects WHERE id=?", id);
    });
  },
  duplicate(id: string): Project | undefined {
    const src = this.get(id);
    if (!src) return undefined;
    return tx(() => {
      const copy = this.create({ title: `${src.title} (복사본)`, description: src.description, prd: src.prd });
      const t = now();
      const idMap = new Map<string, string>();
      const items = all("SELECT * FROM items WHERE project_id=? ORDER BY \"order\"", id);
      for (const it of items) idMap.set(it.id as string, rid());
      for (const it of items) {
        run(
          "INSERT INTO items (id,project_id,type,parent_id,\"order\",title,description,priority,status,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          idMap.get(it.id as string), copy.id, it.type, it.parent_id ? idMap.get(it.parent_id as string) ?? null : null,
          it.order, it.title, it.description, it.priority, it.status, it.data, t, t,
        );
      }
      const pageMap = new Map<string, string>();
      const pages = all("SELECT * FROM pages WHERE project_id=?", id);
      for (const p of pages) pageMap.set(p.id as string, rid());
      for (const p of pages) {
        const linked = j<string[]>(p.linked_spec_ids, []).map((s) => idMap.get(s) ?? s);
        run(
          "INSERT INTO pages (id,project_id,parent_id,\"order\",name,description,linked_spec_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
          pageMap.get(p.id as string), copy.id, p.parent_id ? pageMap.get(p.parent_id as string) ?? null : null,
          p.order, p.name, p.description, JSON.stringify(linked), t, t,
        );
      }
      for (const f of all("SELECT * FROM flows WHERE project_id=?", id)) {
        run("INSERT INTO flows (id,project_id,name,request,nodes,edges,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
          rid(), copy.id, f.name, f.request, f.nodes, f.edges, t, t);
      }
      return copy;
    });
  },
};
