import { items } from "@/lib/repo";
import { FeaturesEditor } from "@/components/features/FeaturesEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeaturesEditor projectId={id} initial={items.list(id)} />;
}
