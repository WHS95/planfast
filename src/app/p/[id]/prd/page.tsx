import { projects } from "@/lib/repo";
import { PrdEditor } from "@/components/prd/PrdEditor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = projects.get(id)!;
  return <PrdEditor projectId={id} initial={p.prd} />;
}
