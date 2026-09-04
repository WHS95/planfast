"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, ClipboardCheck, History, MessageSquare, PanelRightClose, PanelRightOpen, Download, Share2, Settings2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { api, debounce } from "@/lib/api";
import { ToolPanel, type ToolTab } from "./ToolPanel";
import { ExportDialog } from "./ExportDialog";
import { ShareDialog } from "./ShareDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { EditorProvider } from "./EditorContext";

const TABS = [
  { key: "prd", label: "PRD" },
  { key: "features", label: "기능명세서" },
  { key: "ia", label: "정보구조도" },
  { key: "flow", label: "유저플로우" },
  { key: "wireframe", label: "와이어프레임" },
];
const TOOLS: { key: ToolTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "manny", label: "매니", icon: Bot },
  { key: "review", label: "검토", icon: ClipboardCheck },
  { key: "version", label: "버전", icon: History },
  { key: "comment", label: "코멘트", icon: MessageSquare },
];

export function EditorShell({ project, children }: { project: Project; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const current = TABS.find((t) => path.startsWith(`/p/${project.id}/${t.key}`))?.key ?? "prd";
  const [tool, setTool] = useState<ToolTab | null>("manny");
  const [title, setTitle] = useState(project.title);
  const [dialog, setDialog] = useState<"export" | "share" | "settings" | null>(null);
  useEffect(() => setTitle(project.title), [project.title]);
  const saveTitle = debounce((t: string) => api(`/api/projects/${project.id}`, { method: "PATCH", json: { title: t } }).then(() => router.refresh()), 600);

  return (
    <EditorProvider project={project} openTool={(t) => setTool(t)}>
      <div className="h-14 border-b bg-panel flex items-center px-3 gap-3 shrink-0">
        <input
          className="font-medium bg-transparent outline-none rounded px-2 py-1 hover:bg-black/[.03] focus:bg-black/[.04] w-56 truncate"
          value={title}
          onChange={(e) => { setTitle(e.target.value); saveTitle(e.target.value); }}
        />
        <nav className="flex items-center gap-1 mx-auto">
          {TABS.map((t) => (
            <Link key={t.key} href={`/p/${project.id}/${t.key}`} className={clsx("px-3 py-1.5 rounded-md text-sm", current === t.key ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-fg")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("settings")} title="프로젝트 설정 · 매니 커스터마이징"><Settings2 size={14} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("share")}><Share2 size={14} /> 공유</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("export")}><Download size={14} /> 내보내기</button>
          <div className="w-px h-5 bg-line mx-1" />
          {TOOLS.map((t) => (
            <button key={t.key} title={t.label} onClick={() => setTool(tool === t.key ? null : t.key)} className={clsx("btn btn-icon", tool === t.key && "bg-accent-soft text-accent")}>
              <t.icon size={16} />
            </button>
          ))}
          <button className="btn btn-icon" onClick={() => setTool(tool ? null : "manny")}>{tool ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</div>
        {tool && (
          <div className="w-[380px] shrink-0 border-l bg-panel flex flex-col min-h-0">
            <ToolPanel tab={tool} project={project} />
          </div>
        )}
      </div>
      {dialog === "export" && <ExportDialog project={project} current={current} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog project={project} onClose={() => setDialog(null)} />}
      {dialog === "settings" && <ProjectSettingsDialog project={project} onClose={() => { setDialog(null); router.refresh(); }} />}
    </EditorProvider>
  );
}
