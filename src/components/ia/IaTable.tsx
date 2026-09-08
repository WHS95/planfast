"use client";
/**
 * 정보구조도를 "IA 구성도(sitemap)" 표로 보는 뷰.
 *
 * 실무에서 쓰는 엑셀 IA 구성도와 같은 열 구성: 1~4Depth · 관련 페이지 · 관리기능 · 설명 · 타입 · Directory · File Name.
 * Depth 열은 저장되는 값이 아니라 `parentId` 계층에서 계산된다(페이지를 옮기면 자동으로 열이 바뀜).
 * 나머지 열은 `page.meta` 의 자유 입력값이며, 다른 문서(기능명세서 등)와 자동 연동되지 않는다.
 */
import { useMemo } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import type { Page, PageMeta } from "@/lib/types";
import { PAGE_TYPE_SUGGESTIONS } from "@/lib/types";
import { flatten } from "./types";

const MAX_DEPTH_COL = 4;

interface Props {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<Pick<Page, "name" | "description">>) => void;
  onPatchMeta: (id: string, patch: PageMeta) => void;
  onAddChild: (parentId: string | null) => void;
  onDelete: (id: string) => void;
}

export function IaTable({ pages, selectedId, onSelect, onPatch, onPatchMeta, onAddChild, onDelete }: Props) {
  const rows = useMemo(() => flatten(pages), [pages]);

  return (
    <div className="absolute inset-0 overflow-auto bg-bg">
      <table className="ia-table w-max min-w-full text-[12px] border-separate border-spacing-0">
        <thead className="sticky top-0 z-20">
          <tr>
            {["1Depth", "2Depth", "3Depth", "4Depth"].map((h) => (
              <th key={h} className="ia-th w-[150px] min-w-[150px]">{h}</th>
            ))}
            <th className="ia-th w-[120px] min-w-[120px]">관련 페이지</th>
            <th className="ia-th w-[100px] min-w-[100px]">관리기능</th>
            <th className="ia-th w-[280px] min-w-[280px]">설명</th>
            <th className="ia-th w-[90px] min-w-[90px]">타입</th>
            <th className="ia-th w-[110px] min-w-[110px]">Directory</th>
            <th className="ia-th w-[130px] min-w-[130px]">File Name</th>
            <th className="ia-th w-[60px] min-w-[60px] text-center">＋/－</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ page, depth }) => {
            const col = Math.min(depth, MAX_DEPTH_COL - 1);
            const over = depth >= MAX_DEPTH_COL ? "· ".repeat(depth - MAX_DEPTH_COL + 1) : "";
            const isRoot = depth === 0;
            const sel = page.id === selectedId;
            return (
              <tr
                key={page.id}
                className={clsx("group", sel && "ring-1 ring-inset ring-accent")}
                onFocusCapture={() => onSelect(page.id)}
              >
                {Array.from({ length: MAX_DEPTH_COL }, (_, i) => (
                  <td key={i} className={clsx("ia-td p-0", isRoot && "bg-black/[.035] dark:bg-white/[.05]")}>
                    {i === col ? (
                      <input
                        className={clsx("ia-cell", isRoot && "font-semibold")}
                        value={over + page.name}
                        onChange={(e) => onPatch(page.id, { name: e.target.value.replace(/^(?:· )+/, "") })}
                        placeholder="페이지명"
                      />
                    ) : null}
                  </td>
                ))}
                <MetaCell page={page} field="relatedPages" onPatchMeta={onPatchMeta} />
                <MetaCell page={page} field="adminFn" onPatchMeta={onPatchMeta} />
                <td className="ia-td p-0">
                  <input className="ia-cell" value={page.description} placeholder="설명"
                    onChange={(e) => onPatch(page.id, { description: e.target.value })} />
                </td>
                <td className="ia-td p-0">
                  <input className="ia-cell" list="ia-page-types" value={page.meta.type ?? ""} placeholder="타입"
                    onChange={(e) => onPatchMeta(page.id, { type: e.target.value })} />
                </td>
                <MetaCell page={page} field="directory" onPatchMeta={onPatchMeta} mono />
                <MetaCell page={page} field="fileName" onPatchMeta={onPatchMeta} mono />
                <td className="ia-td text-center whitespace-nowrap">
                  <button className="btn btn-icon !h-6 !w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="하위 페이지 추가" onClick={() => onAddChild(page.id)}><Plus size={12} /></button>
                  <button className="btn btn-icon !h-6 !w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger"
                    title="삭제" onClick={() => onDelete(page.id)}><Trash2 size={12} /></button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={MAX_DEPTH_COL + 7} className="ia-td">
              <button className="btn btn-sm btn-ghost" onClick={() => onAddChild(null)}><Plus size={13} /> 최상위 페이지 추가</button>
            </td>
          </tr>
        </tbody>
      </table>
      <datalist id="ia-page-types">
        {PAGE_TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

function MetaCell({ page, field, onPatchMeta, mono }: {
  page: Page; field: keyof PageMeta & ("type" | "directory" | "fileName" | "adminFn" | "relatedPages");
  onPatchMeta: (id: string, patch: PageMeta) => void; mono?: boolean;
}) {
  return (
    <td className="ia-td p-0">
      <input
        className={clsx("ia-cell", mono && "font-mono text-[11px]")}
        value={(page.meta[field] as string) ?? ""}
        onChange={(e) => onPatchMeta(page.id, { [field]: e.target.value } as PageMeta)}
      />
    </td>
  );
}
