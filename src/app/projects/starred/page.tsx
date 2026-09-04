import { projects } from "@/lib/repo";
import { ProjectGrid } from "@/components/ProjectGrid";
export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold mb-6">즐겨찾기</h1>
      <ProjectGrid projects={projects.list({ starred: true })} />
    </div></div>
  );
}
