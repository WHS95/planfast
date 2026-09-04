"use client";
import type { Project } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
export function ExportDialog({ project, onClose }: { project: Project; current?: string; onClose: () => void }) {
  return <Dialog title="ExportDialog" onClose={onClose}><div className="text-sm text-muted">준비 중 · {project.title}</div></Dialog>;
}
