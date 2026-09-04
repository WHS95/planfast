import Link from "next/link";
import { Users } from "lucide-react";
import { meetings, projects } from "@/lib/repo";
import { NewMeetingButton } from "@/components/meetings/NewMeetingButton";

export const dynamic = "force-dynamic";

export default function MeetingsPage() {
  const list = meetings.list().map((m) => {
    const ds = meetings.decisions(m.id);
    return { ...m, projectTitle: m.projectId ? projects.get(m.projectId)?.title ?? null : null, total: ds.length, confirmed: ds.filter((d) => d.status === "confirmed").length };
  });
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Users size={20} className="text-accent" /> 기획실</h1>
            <p className="text-xs text-muted mt-1">회의록을 적고 결정 사항을 추출해 기획서에 반영하세요.</p>
          </div>
          <NewMeetingButton />
        </div>
        {list.length === 0 && (
          <div className="text-muted text-sm py-16 text-center border rounded-lg border-dashed">아직 회의록이 없습니다.</div>
        )}
        <div className="space-y-2">
          {list.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="card p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.title}</div>
                <div className="text-xs text-muted mt-0.5">{new Date(m.heldAt).toLocaleDateString("ko-KR")} · {m.projectTitle ?? "연결된 프로젝트 없음"}</div>
              </div>
              <span className="text-[11px] text-muted shrink-0">{m.total ? `결정 ${m.total}건 · 확정 ${m.confirmed}` : "결정 없음"}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
