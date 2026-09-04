import { projects } from "@/lib/repo";
import { HomeComposer } from "@/components/HomeComposer";
import { ProjectGrid } from "@/components/ProjectGrid";

export default function HomePage() {
  const recent = projects.list().slice(0, 6);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
        <h1 className="text-2xl font-semibold text-center">무엇을 만들고 싶으신가요?</h1>
        <p className="text-muted text-center mt-2">아이디어나 회의록을 넣으면 매니가 PRD → 기능명세서 → 유저플로우 → 와이어프레임 순으로 기획서를 만듭니다.</p>
        <div className="mt-8"><HomeComposer /></div>
        {recent.length > 0 && (
          <section className="mt-16">
            <h2 className="text-sm font-medium text-muted mb-3">최근 프로젝트</h2>
            <ProjectGrid projects={recent} />
          </section>
        )}
      </div>
    </div>
  );
}
