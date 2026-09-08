import { projects, pages, items, flows, wireframes, versions } from "@/lib/repo";
import { buildScreenSpec } from "@/lib/export/screenSpec";
import { SpecView } from "@/components/spec/SpecView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.get(id);
  if (!project) return null;
  const built = buildScreenSpec({
    project,
    pages: pages.list(id),
    items: items.list(id),
    flows: flows.list(id),
    wireframes: wireframes.list(id).map((wf) => ({ wf, pages: wireframes.pages(wf.id) })),
    versions: versions.list(id),
  });
  return <SpecView projectId={id} projectTitle={project.title} built={built} />;
}
