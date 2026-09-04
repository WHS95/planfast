import { Link2Off } from "lucide-react";
import { shareLinks, projects, items, pages, flows, wireframes, activity } from "@/lib/repo";
import { ShareView } from "@/components/share/ShareView";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const projectId = shareLinks.resolve(token);
  const project = projectId ? projects.get(projectId) : undefined;
  if (!projectId || !project || project.deletedAt) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <Link2Off size={36} className="mx-auto text-muted" />
          <h1 className="text-lg font-semibold">열 수 없는 링크예요</h1>
          <p className="text-sm text-muted">링크가 만료됐거나 비활성화됐어요. 링크를 보내준 사람에게 새 링크를 요청해 주세요.</p>
        </div>
      </div>
    );
  }
  activity.log(projectId, "share.view", token.slice(0, 6), {}, "viewer");
  const wfs = wireframes.list(projectId).map((w) => ({ ...w, pages: wireframes.pages(w.id) }));
  return <ShareView project={project} items={items.list(projectId)} pages={pages.list(projectId)} flows={flows.list(projectId)} wireframes={wfs} />;
}
