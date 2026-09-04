"use client";
import type { Project } from "@/lib/types";
import { Scroll } from "./ShareView";

export function SharePrd({ project }: { project: Project }) {
  return (
    <Scroll>
      {project.description && <p className="text-muted mb-6">{project.description}</p>}
      <div className="space-y-8">
        {project.prd.sections.map((s) => (
          <section key={s.id}>
            <h2 className="text-base font-semibold mb-3">{s.title}</h2>
            <dl className="space-y-3">
              {s.fields.map((f) => (
                <div key={f.id} className="grid grid-cols-[140px_1fr] gap-3 text-sm">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="whitespace-pre-wrap">
                    {f.values ? (f.values.length ? <span className="flex flex-wrap gap-1">{f.values.map((v) => <span key={v} className="chip">{v}</span>)}</span> : <span className="text-muted">—</span>)
                      : f.content?.trim() ? f.content : <span className="text-muted">—</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Scroll>
  );
}
