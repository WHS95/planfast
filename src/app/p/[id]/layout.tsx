import { notFound } from "next/navigation";
import { projects } from "@/lib/repo";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.get(id);
  if (!project) notFound();
  return <EditorShell project={project}>{children}</EditorShell>;
}
