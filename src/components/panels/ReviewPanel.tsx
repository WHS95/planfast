"use client";
import type { Project } from "@/lib/types";
export function ReviewPanel({ project }: { project: Project }) {
  return <div className="p-4 text-sm text-muted">ReviewPanel (준비 중) · {project.title}</div>;
}
