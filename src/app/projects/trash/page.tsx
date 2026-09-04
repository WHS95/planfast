import { projects } from "@/lib/repo";
import { ProjectGrid } from "@/components/ProjectGrid";
export default function Page() {
  return (
    <div className="flex-1 overflow-y-auto"><div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold mb-1">휴지통</h1>
      <p className="text-sm text-muted mb-6">복구하거나 영구 삭제할 수 있습니다.</p>
      <ProjectGrid projects={projects.list({ deleted: true })} trash />
    </div></div>
  );
}
