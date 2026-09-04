/** 기능명세서/PRD exports: xlsx, md, txt */
import ExcelJS from "exceljs";
import { prdToMarkdown, itemsToMarkdown } from "@/lib/ai/context";
import { PRIORITY_LABEL, SPEC_SLOTS, SPEC_SLOT_LABEL, STATUS_LABEL, type Item, type Project, type SpecData } from "@/lib/types";

export function featuresMarkdown(project: Project, items: Item[]): string {
  return [prdToMarkdown(project.prd, project.title), "# 기능명세서", itemsToMarkdown(items) || "(항목 없음)"].join("\n\n");
}

export function featuresText(project: Project, items: Item[]): string {
  return featuresMarkdown(project, items)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^- \[( |x)\] /gm, (_m, x) => (x === "x" ? "[v] " : "[ ] "))
    .replace(/^- /gm, "• ");
}

export async function featuresXlsx(project: Project, items: Item[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PlanFast";
  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
    r.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const prd = wb.addWorksheet("PRD");
  prd.columns = [{ header: "섹션", key: "s", width: 22 }, { header: "항목", key: "l", width: 22 }, { header: "내용", key: "c", width: 90 }];
  head(prd);
  for (const sec of project.prd.sections) for (const f of sec.fields) prd.addRow({ s: sec.title, l: f.label, c: f.values?.length ? f.values.join(", ") : f.content });
  prd.eachRow((r) => (r.alignment = { wrapText: true, vertical: "top" }));

  const ws = wb.addWorksheet("기능명세서");
  ws.columns = [
    { header: "요구사항", key: "req", width: 24 }, { header: "기능", key: "feat", width: 24 }, { header: "상세기능", key: "spec", width: 24 },
    { header: "설명", key: "desc", width: 40 }, { header: "중요도", key: "pri", width: 8 }, { header: "상태", key: "st", width: 12 },
    ...SPEC_SLOTS.map((k) => ({ header: SPEC_SLOT_LABEL[k].replace(" & 접근", ""), key: k, width: 28 })),
  ];
  head(ws);
  const byParent = new Map<string | null, Item[]>();
  for (const it of items) byParent.set(it.parentId, [...(byParent.get(it.parentId) ?? []), it]);
  for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order);
  const meta = (it: Item) => ({ pri: PRIORITY_LABEL[it.priority], st: STATUS_LABEL[it.status] });
  for (const req of (byParent.get(null) ?? []).filter((i) => i.type === "requirement")) {
    ws.addRow({ req: req.title, desc: req.description, ...meta(req) });
    for (const feat of byParent.get(req.id) ?? []) {
      ws.addRow({ req: req.title, feat: feat.title, desc: feat.description, ...meta(feat) });
      for (const spec of byParent.get(feat.id) ?? []) {
        const slots = (spec.data as SpecData).slots ?? {};
        ws.addRow({ req: req.title, feat: feat.title, spec: spec.title, desc: spec.description, ...meta(spec), ...Object.fromEntries(SPEC_SLOTS.map((k) => [k, slots[k] ?? ""])) });
      }
    }
  }
  ws.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: "top" }; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
