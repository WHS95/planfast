import { notFound } from "next/navigation";
import { meetings, projects } from "@/lib/repo";
import { MeetingEditor } from "@/components/meetings/MeetingEditor";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const meeting = meetings.get(meetingId);
  if (!meeting) notFound();
  const decisions = meetings.decisions(meetingId);
  const projectList = projects.list().map((p) => ({ id: p.id, title: p.title }));
  return <MeetingEditor meeting={meeting} initialDecisions={decisions} projects={projectList} />;
}
