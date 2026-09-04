import { projects } from "@/lib/repo";
import { ProjectGrid } from "@/components/ProjectGrid";
import { NewProjectButton } from "@/components/NewProjectButton";
export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6"><h1 className="text-xl font-semibold">모든 프로젝트</h1><NewProjectButton /></div>
      <ProjectGrid projects={projects.list()} />
    </div></div>
  );
}
