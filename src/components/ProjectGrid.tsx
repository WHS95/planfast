"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, MoreHorizontal, Copy, Trash2, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import clsx from "clsx";
import { useDialog } from "@/components/ui/DialogProvider";

export function ProjectGrid({ projects, trash = false }: { projects: Project[]; trash?: boolean }) {
  const { confirm } = useDialog();
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  async function act(id: string, action: string) {
    setMenu(null);
    if (action === "delete") { if (!(await confirm({ message: "영구 삭제할까요? 되돌릴 수 없습니다.", confirmLabel: "영구 삭제", danger: true }))) return; await api(`/api/projects/${id}`, { method: "DELETE" }); }
    else await api(`/api/projects/${id}`, { method: "PATCH", json: { action } });
    router.refresh();
  }
  async function star(p: Project) { await api(`/api/projects/${p.id}`, { method: "PATCH", json: { starred: !p.starred } }); router.refresh(); }
  if (!projects.length) return <div className="text-muted text-sm py-10 text-center border rounded-lg border-dashed">프로젝트가 없습니다.</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {projects.map((p) => (
        <div key={p.id} className={clsx("card p-4 relative group", menu !== p.id && "lift")}>
          <Link href={trash ? "#" : `/p/${p.id}/prd`} className="block">
            <div className="h-20 rounded-md bg-accent-soft/60 mb-3 flex items-center justify-center text-accent text-2xl font-semibold">{p.title.slice(0, 1)}</div>
            <div className="font-medium truncate pr-12">{p.title}</div>
            <div className="text-xs text-muted mt-1 line-clamp-2 min-h-[2.4em]">{p.description || "설명 없음"}</div>
            <div className="text-[11px] text-muted mt-2">{new Date(p.updatedAt).toLocaleString("ko-KR")}</div>
          </Link>
          <div className="absolute top-3 right-3 flex gap-0.5">
            {!trash && <button className={clsx("btn btn-icon", p.starred && "text-warn")} onClick={() => star(p)}><Star size={14} fill={p.starred ? "currentColor" : "none"} /></button>}
            <button className="btn btn-icon" onClick={() => setMenu(menu === p.id ? null : p.id)}><MoreHorizontal size={14} /></button>
          </div>
          {menu === p.id && (
            <div className="absolute top-11 right-3 card shadow-lg z-10 py-1 text-sm w-40">
              {trash ? (
                <>
                  <MenuItem onClick={() => act(p.id, "restore")} icon={<RotateCcw size={14} />}>복구</MenuItem>
                  <MenuItem onClick={() => act(p.id, "delete")} icon={<XCircle size={14} />} danger>영구 삭제</MenuItem>
                </>
              ) : (
                <>
                  <MenuItem onClick={() => act(p.id, "duplicate")} icon={<Copy size={14} />}>복제</MenuItem>
                  <MenuItem onClick={() => act(p.id, "trash")} icon={<Trash2 size={14} />} danger>휴지통으로</MenuItem>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function MenuItem({ onClick, icon, children, danger }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  return <button onClick={onClick} className={clsx("w-full flex items-center gap-2 px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.05]", danger && "text-danger")}>{icon}{children}</button>;
}

/** 목록을 불러오는 동안 쓰는 스켈레톤. `<ProjectGridSkeleton count={6} />` */
export function ProjectGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4">
          <div className="skeleton h-20 mb-3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-full mt-2" />
          <div className="skeleton h-3 w-1/3 mt-2" />
        </div>
      ))}
    </div>
  );
}
