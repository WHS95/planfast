import { pages, items } from "@/lib/repo";
import { IaEditor } from "@/components/ia/IaEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const all = items.list(id);
  const specs = all.filter((i) => i.type === "spec").map((s) => ({ id: s.id, title: s.title, featureTitle: all.find((f) => f.id === s.parentId)?.title ?? "" }));
  return <IaEditor projectId={id} initialPages={pages.list(id)} initialSpecs={specs} />;
}
