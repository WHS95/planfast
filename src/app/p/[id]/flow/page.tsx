import { projects, flows } from "@/lib/repo";
import { flowReadiness } from "@/lib/flow/readiness";
import { FlowEditor } from "@/components/flow/FlowEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = projects.get(id)!;
  return <FlowEditor projectId={id} initialFlows={flows.list(id)} initialReadiness={flowReadiness(p)} />;
}
