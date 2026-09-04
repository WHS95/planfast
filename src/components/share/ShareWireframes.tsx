"use client";
import { useState } from "react";
import clsx from "clsx";
import { Monitor, Smartphone } from "lucide-react";
import { Empty } from "@/components/ui";
import type { WfWithPages } from "./ShareView";

export function ShareWireframes({ wireframes }: { wireframes: WfWithPages[] }) {
  const [wfId, setWfId] = useState(wireframes[0]?.id ?? null);
  const wf = wireframes.find((w) => w.id === wfId);
  const [pageId, setPageId] = useState<string | null>(null);
  const page = wf?.pages.find((p) => p.id === pageId) ?? wf?.pages[0];
  if (wireframes.length === 0) return <div className="p-8"><Empty>와이어프레임이 아직 없어요</Empty></div>;
  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-64 border-r bg-panel overflow-y-auto p-2 space-y-3 shrink-0">
        {wireframes.map((w) => (
          <div key={w.id}>
            <button onClick={() => { setWfId(w.id); setPageId(null); }} className={clsx("w-full text-left text-sm rounded-md px-2.5 py-1.5 flex items-center gap-2", wfId === w.id ? "font-medium" : "text-muted")}>
              {w.device === "mobile" ? <Smartphone size={13} /> : <Monitor size={13} />} <span className="truncate">{w.name}</span>
            </button>
            {wfId === w.id && (
              <ul className="pl-3 space-y-0.5">
                {w.pages.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setPageId(p.id)} className={clsx("w-full text-left text-xs rounded-md px-2 py-1 truncate", page?.id === p.id ? "bg-accent-soft text-accent" : "hover:bg-black/[.03] dark:hover:bg-white/[.05]")}>
                      {p.name}{p.status !== "done" && <span className="text-muted"> · {p.status === "error" ? "오류" : "생성 중"}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </aside>
      <div className="flex-1 min-w-0 bg-bg overflow-auto flex items-start justify-center p-6">
        {page?.html ? (
          <iframe title={page.name} srcDoc={page.html} sandbox="" className={clsx("bg-white border rounded-lg shadow-sm", wf?.device === "mobile" ? "w-[390px] h-[844px]" : "w-full max-w-5xl h-[800px]")} />
        ) : <div className="text-sm text-muted py-10">{page ? "아직 생성되지 않은 페이지예요" : "페이지를 선택하세요"}</div>}
      </div>
    </div>
  );
}
