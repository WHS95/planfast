import { flows, wireframes } from "@/lib/repo";
import { isRunning } from "@/lib/wireframe/generator";
import { WireframeTab, type WfSummary } from "@/components/wireframe/WireframeTab";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list: WfSummary[] = wireframes.list(id).map((wf) => ({ ...wf, running: isRunning(wf.id), pages: wireframes.pages(wf.id).map((p) => ({ ...p, html: "" })) }));
  const fl = flows.list(id).map((f) => ({ id: f.id, name: f.name, nodes: f.nodes, edges: f.edges }));
  return <WireframeTab projectId={id} initialWireframes={list} initialFlows={fl} />;
}
