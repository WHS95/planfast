"use client";
import { SPEC_SLOT_LABEL, ITEM_TYPE_LABEL, type FeatureData, type Item, type RequirementData, type SpecData, type SpecSlot } from "@/lib/types";
import { Empty, PriorityDot, StatusBadge } from "@/components/ui";
import { Scroll } from "./ShareView";

export function ShareFeatures({ items }: { items: Item[] }) {
  const byParent = new Map<string | null, Item[]>();
  for (const it of items) byParent.set(it.parentId, [...(byParent.get(it.parentId) ?? []), it]);
  const kids = (id: string | null) => (byParent.get(id) ?? []).sort((a, b) => a.order - b.order);
  const reqs = kids(null).filter((i) => i.type === "requirement");
  return (
    <Scroll>
      {reqs.length === 0 ? <Empty>기능명세서가 아직 비어 있어요</Empty> : (
        <div className="space-y-8">
          {reqs.map((r, ri) => (
            <section key={r.id} className="space-y-4">
              <Head it={r} n={`${ri + 1}`} />
              {(r.data as RequirementData).acceptance?.length > 0 && (
                <ul className="text-sm space-y-1 pl-1">{(r.data as RequirementData).acceptance.map((a) => <li key={a.id} className="flex gap-2"><input type="checkbox" checked={a.done} readOnly className="mt-1" /><span>{a.text}</span></li>)}</ul>
              )}
              {kids(r.id).map((f, fi) => {
                const fd = f.data as FeatureData;
                return (
                  <div key={f.id} className="pl-4 border-l-2 space-y-3">
                    <Head it={f} n={`${ri + 1}.${fi + 1}`} />
                    {(fd.roles?.length || fd.rationale || fd.successCriteria) ? (
                      <dl className="text-sm grid grid-cols-[100px_1fr] gap-x-3 gap-y-1">
                        {fd.roles?.length > 0 && <><dt className="text-muted">사용자 역할</dt><dd>{fd.roles.join(", ")}</dd></>}
                        {fd.rationale && <><dt className="text-muted">근거</dt><dd className="whitespace-pre-wrap">{fd.rationale}</dd></>}
                        {fd.successCriteria && <><dt className="text-muted">성공 기준</dt><dd className="whitespace-pre-wrap">{fd.successCriteria}</dd></>}
                      </dl>
                    ) : null}
                    {kids(f.id).map((s, si) => {
                      const sd = s.data as SpecData;
                      const slots = Object.entries(sd.slots ?? {}).filter(([k, v]) => v?.trim() && !(sd.hiddenSlots ?? []).includes(k as SpecSlot));
                      return (
                        <div key={s.id} className="card p-4 space-y-2">
                          <Head it={s} n={`${ri + 1}.${fi + 1}.${si + 1}`} />
                          {slots.length > 0 && (
                            <dl className="text-sm grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
                              {slots.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{SPEC_SLOT_LABEL[k as SpecSlot] ?? k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>)}
                            </dl>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </Scroll>
  );
}

function Head({ it, n }: { it: Item; n: string }) {
  const size = it.type === "requirement" ? "text-lg font-semibold" : it.type === "feature" ? "text-base font-medium" : "text-sm font-medium";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted font-mono">{n}</span>
        <span className="text-[11px] text-muted">{ITEM_TYPE_LABEL[it.type]}</span>
        <span className={size}>{it.title || <span className="text-muted">(제목 없음)</span>}</span>
        <PriorityDot priority={it.priority} />
        <StatusBadge status={it.status} />
      </div>
      {it.description && <p className="text-sm text-muted whitespace-pre-wrap">{it.description}</p>}
    </div>
  );
}
