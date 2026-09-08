"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bot, ClipboardCheck, History, MessageSquare, PanelRightClose, PanelRightOpen, Download, Share2, Settings2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { api, debounce } from "@/lib/api";
import { ResizeHandle, useResizable } from "@/components/ui/Resizable";
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
  { key: "spec", label: "화면설계서" },
];
const TOOLS: { key: ToolTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "manny", label: "매니", icon: Bot },
  { key: "review", label: "검토", icon: ClipboardCheck },
  { key: "version", label: "버전", icon: History },
  { key: "comment", label: "코멘트", icon: MessageSquare },
];

/** 우측 도구 패널 폭 — 기본 380 / 320~720, localStorage(`planfast:size:editor.tool`) 에 기억 */
const TOOL_WIDTH = { id: "editor.tool", initial: 380, min: 320, max: 720 } as const;

/** 편집 가능한 곳에 포커스가 있으면 단축키를 먹지 않는다 */
function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}

export function EditorShell({ project, children }: { project: Project; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const current = TABS.find((t) => path.startsWith(`/p/${project.id}/${t.key}`))?.key ?? "prd";

  const [tool, setTool] = useState<ToolTab | null>("manny");
  const rz = useResizable({ ...TOOL_WIDTH, edge: "left" });
  const [dialog, setDialog] = useState<"export" | "share" | "settings" | null>(null);

  /* ── 제목: 자동 저장 + "저장 중… → 저장됨" 표시 ───────────────────────── */
  const [titleState, setTitleState] = useState({ projectId: project.id, value: project.title });
  const title = titleState.projectId === project.id ? titleState.value : project.title;
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");

  // debounce 는 한 번만 만든다(렌더마다 새로 만들면 타이머가 초기화되지 않아 매 타이핑이 저장된다)
  const saveTitle = useMemo(
    () =>
      debounce((t: string) => {
        api(`/api/projects/${project.id}`, { method: "PATCH", json: { title: t } })
          .then(() => { setSave("saved"); router.refresh(); })
          .catch(() => setSave("idle"));
      }, 600),
    [project.id, router],
  );
  // "저장됨" 은 잠시 뒤 스스로 사라진다 (effect 안에서 동기 setState 를 하지 않도록 타이머로)
  useEffect(() => {
    if (save !== "saved") return;
    const t = setTimeout(() => setSave("idle"), 1600);
    return () => clearTimeout(t);
  }, [save]);

  const onTitle = useCallback(
    (v: string) => {
      setTitleState({ projectId: project.id, value: v });
      setSave("saving");
      saveTitle(v);
    },
    [project.id, saveTitle],
  );

  /* ── 단축키: [ · ] 로 도구 패널 토글 ─────────────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setTool((t) => (t ? null : "manny"));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const openTool = useCallback((t: ToolTab) => setTool(t), []);

  const panelSpring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 460, damping: 42, mass: 0.7 };
  const pillSpring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 40, mass: 0.6 };

  return (
    <EditorProvider project={project} openTool={openTool}>
      <header className="h-14 border-b bg-panel flex items-center px-3 gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <label className="autosize font-medium rounded-md" style={{ ["--autosize-max" as string]: "16rem" } as React.CSSProperties} data-value={title}>
            <input
              className={clsx("bg-transparent outline-none rounded-md truncate transition-colors duration-200", save === "saving" ? "bg-accent-soft/70" : "hover:bg-[var(--hover)] focus:bg-[var(--hover-strong)]")}
              value={title}
              aria-label="프로젝트 제목"
              onChange={(e) => onTitle(e.target.value)}
            />
          </label>
          <AnimatePresence initial={false} mode="wait">
            {save !== "idle" && (
              <motion.span
                key={save}
                className="text-[11px] text-muted whitespace-nowrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
              >
                {save === "saving" ? "저장 중…" : "저장됨"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex items-center gap-1 mx-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/p/${project.id}/${t.key}`}
              aria-current={current === t.key ? "page" : undefined}
              className={clsx("relative px-3 py-1.5 rounded-md text-sm transition-colors", current === t.key ? "text-accent font-medium" : "text-muted hover:text-fg")}
            >
              {current === t.key && (
                <motion.span layoutId="pf-tab-pill" className="absolute inset-0 rounded-md bg-accent-soft" transition={pillSpring} />
              )}
              <span className="relative">{t.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("settings")} title="프로젝트 설정 · 매니 커스터마이징"><Settings2 size={14} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("share")}><Share2 size={14} /> 공유</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog("export")}><Download size={14} /> 내보내기</button>
          <div className="w-px h-5 bg-line mx-1" />
          {TOOLS.map((t) => (
            <button key={t.key} title={t.label} aria-pressed={tool === t.key} onClick={() => setTool((c) => (c === t.key ? null : t.key))} className={clsx("btn btn-icon", tool === t.key && "bg-accent-soft text-accent")}>
              <t.icon size={16} />
            </button>
          ))}
          <button className="btn btn-icon" title={tool ? "도구 패널 닫기  ]" : "도구 패널 열기  ]"} onClick={() => setTool((c) => (c ? null : "manny"))}>
            {tool ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={path}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
              initial={{ opacity: 0, y: reduce ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -4 }}
              transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {tool && (
            <motion.aside
              key="tool"
              className="relative shrink-0 border-l bg-panel overflow-hidden"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: rz.size, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              // 드래그 중엔 스프링을 끄고 포인터를 그대로 따라간다
              transition={rz.dragging ? { duration: 0 } : panelSpring}
            >
              {/* 폭이 애니메이션되는 동안 내용이 리플로우되지 않도록 고정 폭 래퍼 */}
              <div className="h-full flex flex-col min-h-0" style={{ width: rz.size }}>
                <ToolPanel tab={tool} project={project} />
              </div>
              <ResizeHandle {...rz.handleProps} className="left-0" label="도구 패널 너비 조절" />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {dialog === "export" && <ExportDialog project={project} current={current} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog project={project} onClose={() => setDialog(null)} />}
      {dialog === "settings" && <ProjectSettingsDialog project={project} onClose={() => { setDialog(null); router.refresh(); }} />}
    </EditorProvider>
  );
}
