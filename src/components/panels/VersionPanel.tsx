"use client";
import type { Project } from "@/lib/types";
export function VersionPanel({ project }: { project: Project }) {
  return <div className="p-4 text-sm text-muted">VersionPanel (준비 중) · {project.title}</div>;
}
