"use client";
import { motion, useReducedMotion } from "motion/react";
import type { Project } from "@/lib/types";
import { MannyPanel } from "@/components/panels/MannyPanel";
import { ReviewPanel } from "@/components/panels/ReviewPanel";
import { VersionPanel } from "@/components/panels/VersionPanel";
import { CommentPanel } from "@/components/panels/CommentPanel";

export type ToolTab = "manny" | "review" | "version" | "comment";

export function ToolPanel({ tab, project }: { tab: ToolTab; project: Project }) {
  const reduce = useReducedMotion();
  // 탭이 바뀌면 새 패널이 살짝 페이드인한다. (exit 없음 → 전환 지연·이중 마운트 없음)
  return (
    <motion.div
      key={tab}
      className="flex-1 min-h-0 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.14, ease: "easeOut" }}
    >
      <Panel tab={tab} project={project} />
    </motion.div>
  );
}

function Panel({ tab, project }: { tab: ToolTab; project: Project }) {
  if (tab === "manny") return <MannyPanel project={project} />;
  if (tab === "review") return <ReviewPanel project={project} />;
  if (tab === "version") return <VersionPanel project={project} />;
  return <CommentPanel project={project} />;
}
