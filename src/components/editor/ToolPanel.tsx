"use client";
import type { Project } from "@/lib/types";
import { MannyPanel } from "@/components/panels/MannyPanel";
import { ReviewPanel } from "@/components/panels/ReviewPanel";
import { VersionPanel } from "@/components/panels/VersionPanel";
import { CommentPanel } from "@/components/panels/CommentPanel";

export type ToolTab = "manny" | "review" | "version" | "comment";

export function ToolPanel({ tab, project }: { tab: ToolTab; project: Project }) {
  if (tab === "manny") return <MannyPanel project={project} />;
  if (tab === "review") return <ReviewPanel project={project} />;
  if (tab === "version") return <VersionPanel project={project} />;
  return <CommentPanel project={project} />;
}
