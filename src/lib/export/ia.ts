/** 정보구조도 exports: IA 구성도(sitemap) 엑셀 */
import ExcelJS from "exceljs";
import type { Item, Page, Project } from "@/lib/types";

const MAX_DEPTH_COL = 4;

/** parentId 계층을 깊이우선으로 펼친다(표의 행 순서 = 화면의 행 순서). */
export function flattenPages(pages: Page[]): { page: Page; depth: number }[] {
  const out: { page: Page; depth: number }[] = [];
  const kids = (parentId: string | null) => pages.filter((p) => p.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const walk = (parentId: string | null, depth: number) => {
    for (const c of kids(parentId)) { out.push({ page: c, depth }); walk(c.id, depth + 1); }
  };
  walk(null, 0);
  const seen = new Set(out.map((o) => o.page.id));
  for (const p of pages) if (!seen.has(p.id)) out.push({ page: p, depth: 0 });
  return out;
}

export async function iaXlsx(project: Project, pages: Page[], items: Item[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PlanFast";
  const ws = wb.addWorksheet("IA구성도");
  const specTitle = new Map(items.map((i) => [i.id, i.title]));

  ws.columns = [
    { header: "1Depth", width: 20 }, { header: "2Depth", width: 20 }, { header: "3Depth", width: 20 }, { header: "4Depth", width: 20 },
    { header: "관련 페이지", width: 16 }, { header: "관리기능", width: 12 }, { header: "설명", width: 46 },
    { header: "타입", width: 10 }, { header: "Directory", width: 14 }, { header: "File Name", width: 18 },
    { header: "연결된 상세기능", width: 34 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", horizontal: "center" };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const { page, depth } of flattenPages(pages)) {
    const col = Math.min(depth, MAX_DEPTH_COL - 1);
    const over = depth >= MAX_DEPTH_COL ? "· ".repeat(depth - MAX_DEPTH_COL + 1) : "";
    const depthCells = Array.from({ length: MAX_DEPTH_COL }, (_, i) => (i === col ? over + page.name : ""));
    const m = page.meta;
    const row = ws.addRow([
      ...depthCells, m.relatedPages ?? "", m.adminFn ?? "", page.description,
      m.type ?? "", m.directory ?? "", m.fileName ?? "",
      page.linkedSpecIds.map((id) => specTitle.get(id)).filter(Boolean).join(", "),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    if (depth === 0) {
      row.font = { bold: true };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    }
  }
  // 얇은 테두리 — 실무에서 그대로 인쇄/공유하는 문서라 격자가 있어야 읽힌다.
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FFD4D4D8" } }, left: { style: "thin", color: { argb: "FFD4D4D8" } }, bottom: { style: "thin", color: { argb: "FFD4D4D8" } }, right: { style: "thin", color: { argb: "FFD4D4D8" } } };
    });
  });

  ws.headerFooter.oddHeader = `&L${project.title} IA 구성도`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
