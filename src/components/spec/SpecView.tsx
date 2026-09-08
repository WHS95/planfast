"use client";
/**
 * 화면설계서 탭 — 정보구조도 페이지마다 정의/to-do/정책/플로우/화면을 모아 한 문서로 읽는 화면.
 *
 * 내보내기(HTML)와 같은 `buildScreenSpec()` 결과를 쓰기 때문에 여기 보이는 것과 내보낸 문서가 같다.
 * 이 탭은 "읽기 전용 조립본"이다 — 내용을 고치려면 각 원본 탭(정보구조도·기능명세서 등)에서 고쳐야 하고,
 * 어디를 고쳐야 하는지 각 章에 바로가기를 달아 두었다.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Download, FileText, Link2, Monitor, Printer, Smartphone, Workflow } from "lucide-react";
import type { BuiltSpec, SpecChapter } from "@/lib/export/screenSpec";

export function SpecView({ projectId, projectTitle, built }: { projectId: string; projectTitle: string; built: BuiltSpec }) {
  const { chapters } = built;
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(chapters[0]?.pageId ?? null);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return chapters;
    return chapters.filter((c) => c.name.toLowerCase().includes(k) || c.definition.toLowerCase().includes(k)
      || c.todos.some((t) => t.title.toLowerCase().includes(k)));
  }, [chapters, q]);

  const filled = chapters.filter((c) => c.policies.length).length;

  if (!chapters.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted text-center px-6">
        <div>
          <div className="mb-2">화면설계서는 정보구조도의 페이지를 기준으로 만들어집니다.</div>
          <Link className="btn btn-sm btn-primary" href={`/p/${projectId}/ia`}>정보구조도에서 페이지 만들기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* 목차 */}
      <aside className="w-60 shrink-0 border-r bg-panel flex flex-col min-h-0">
        <div className="p-2 border-b">
          <input className="input !py-1.5 text-xs" placeholder="페이지 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <nav className="flex-1 overflow-y-auto py-1">
          {filtered.map((c) => (
            <a key={c.pageId} href={`#ch-${c.pageId}`} onClick={() => setActive(c.pageId)}
              className={clsx("flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/[.03] dark:hover:bg-white/[.04]", active === c.pageId && "bg-accent-soft text-accent font-medium")}>
              <span className="text-[10px] text-muted w-5 shrink-0 text-right">{c.no}</span>
              <span className="truncate flex-1">{c.name || "(이름 없음)"}</span>
              {!c.policies.length && <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" title="정책 없음 (상세기능 미연결)" />}
            </a>
          ))}
          {!filtered.length && <div className="px-3 py-4 text-xs text-muted">검색 결과가 없습니다.</div>}
        </nav>
        <div className="border-t p-2 text-[11px] text-muted">
          {chapters.length}개 화면 · 정책 있는 화면 {filled}개
        </div>
      </aside>

      {/* 문서 */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="h-11 border-b bg-panel flex items-center px-3 gap-2 shrink-0">
          <h1 className="text-sm font-semibold">화면설계서</h1>
          <span className="text-[11px] text-muted truncate">정보구조도·기능명세서·유저플로우·와이어프레임을 모아 조립한 문서입니다</span>
          <div className="ml-auto flex items-center gap-1.5">
            <a className="btn btn-sm" href={`/api/projects/${projectId}/export?type=screen-spec-html`}><Download size={13} /> HTML 내보내기</a>
            <a className="btn btn-sm" href={`/api/projects/${projectId}/export?type=screen-spec-html`} target="_blank" rel="noopener"
              title="새 탭에서 열어 인쇄(⌘P) → PDF로 저장하면 A4 가로 문서가 됩니다"><Printer size={13} /> 인쇄용 보기</a>
          </div>
        </div>

        {filled === 0 && (
          <div className="mx-4 mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-relaxed">
            아직 어느 화면에도 상세기능이 연결되어 있지 않아 <b>to-do·정책</b> 칸이 비어 있습니다.{" "}
            <Link href={`/p/${projectId}/ia`} className="underline font-medium">정보구조도 → 매니로 생성 → &quot;상세기능 연결&quot;</Link>
            을 실행하면 어느 동작이 어느 화면에서 일어나는지 매니가 매칭해 채워줍니다.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {filtered.map((c) => <Chapter key={c.pageId} c={c} projectId={projectId} title={projectTitle} />)}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-[11px] font-semibold text-accent tracking-wide mb-1.5">[{label}]</h3>
      {children}
    </section>
  );
}
const None = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted">{children}</p>;

function Chapter({ c, projectId, title }: { c: SpecChapter; projectId: string; title: string }) {
  return (
    <article id={`ch-${c.pageId}`} className="card p-5 scroll-mt-4">
      <header className="flex items-baseline gap-2 border-b-2 border-fg pb-2 mb-3">
        <span className="chip !py-0 !text-[11px] bg-accent-soft text-accent border-transparent">{c.no}</span>
        <h2 className="text-base font-semibold truncate">{c.name || "(이름 없음)"}</h2>
        <span className="ml-auto text-[10px] text-muted shrink-0">{title} · 화면설계서</span>
      </header>

      <Section label="정의">
        {c.definition
          ? <p className="text-sm whitespace-pre-wrap">{c.definition}</p>
          : <None>설명이 없습니다. <Link href={`/p/${projectId}/ia`} className="underline">정보구조도</Link>에서 이 페이지의 설명을 작성하세요.</None>}
      </Section>

      <Section label="to-do">
        {c.todos.length
          ? <ul className="text-sm list-disc pl-5 space-y-0.5">{c.todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
          : <None>연결된 상세기능이 없습니다.</None>}
      </Section>

      <Section label="정책">
        {c.policies.length ? (
          <div className="space-y-2">
            {c.policies.map((p) => (
              <div key={p.specId} className="rounded-md border p-3">
                <div className="text-[13px] font-medium mb-1.5 flex items-baseline gap-2">
                  {p.specTitle}
                  {p.featureTitle && <span className="text-[11px] text-muted font-normal">{p.featureTitle}</span>}
                </div>
                {p.slots.length ? (
                  <table className="w-full text-xs">
                    <tbody>
                      {p.slots.map((s) => (
                        <tr key={s.label} className="align-top border-b last:border-0">
                          <th className="text-left font-semibold text-muted w-24 py-1 pr-2">{s.label}</th>
                          <td className="py-1 whitespace-pre-wrap">{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <None>슬롯이 아직 작성되지 않았습니다.</None>}
                {p.acceptance && (
                  <div className="mt-2 text-xs">
                    <b>인수조건 · {p.acceptance.reqTitle}</b>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">{p.acceptance.texts.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <None><Link href={`/p/${projectId}/ia`} className="underline">정보구조도</Link>에서 이 화면에 상세기능을 연결하면 정책이 채워집니다.</None>
        )}
      </Section>

      <Section label="플로우">
        {c.flow ? (
          <>
            <p className="text-[11px] text-muted mb-1.5 flex items-center gap-1"><Workflow size={11} /> {c.flow.name}{c.flow.frameLabel ? ` · ${c.flow.frameLabel}` : ""}</p>
            <div className="rounded-md border bg-white p-2 overflow-x-auto [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: c.flow.svg }} />
          </>
        ) : (
          <None>이 화면 이름과 맞는 <Link href={`/p/${projectId}/flow`} className="underline">유저플로우</Link>(또는 프레임)를 찾지 못했습니다.</None>
        )}
      </Section>

      <Section label="화면">
        {c.screen ? (
          <>
            <p className="text-[11px] text-muted mb-1.5 flex items-center gap-1">
              {c.screen.device === "mobile" ? <Smartphone size={11} /> : <Monitor size={11} />} {c.screen.wfName}
            </p>
            <div className={clsx("rounded-md border overflow-hidden bg-white", c.screen.device === "mobile" && "max-w-[390px]")}>
              <iframe sandbox="" srcDoc={c.screen.html} className="w-full block border-0" style={{ height: c.screen.device === "mobile" ? 700 : 560 }} title={`${c.name} 화면`} />
            </div>
          </>
        ) : (
          <None>이 화면 이름과 맞는 <Link href={`/p/${projectId}/wireframe`} className="underline">와이어프레임</Link>을 찾지 못했습니다.</None>
        )}
      </Section>

      <footer className="mt-4 pt-2 border-t flex gap-3 text-[11px] text-muted">
        <Link href={`/p/${projectId}/ia`} className="hover:text-fg flex items-center gap-1"><FileText size={11} /> 정보구조도에서 수정</Link>
        <Link href={`/p/${projectId}/features`} className="hover:text-fg flex items-center gap-1"><Link2 size={11} /> 기능명세서에서 수정</Link>
      </footer>
    </article>
  );
}
