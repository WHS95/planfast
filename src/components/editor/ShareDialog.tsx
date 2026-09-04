"use client";
import type { Project } from "@/lib/types";
import { Dialog } from "@/components/ui/Dialog";
export function ShareDialog({ project, onClose }: { project: Project; current?: string; onClose: () => void }) {
  return <Dialog title="ShareDialog" onClose={onClose}><div className="text-sm text-muted">준비 중 · {project.title}</div></Dialog>;
}
