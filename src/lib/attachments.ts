/**
 * Attachment text extraction (server only).
 *  - pdf → pdf-parse, docx → mammoth, xlsx → exceljs (CSV-ish), txt/md/csv/json → raw
 *  - hwp/hwpx → name only (본문 추출 미지원)
 */
export const MAX_ATTACHMENT_TEXT = 60_000;

const ext = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

export async function extractText(name: string, mime: string, buf: Buffer): Promise<string> {
  const e = ext(name);
  try {
    if (e === "pdf" || mime === "application/pdf") return cap(await fromPdf(buf));
    if (e === "docx" || mime.includes("wordprocessingml")) return cap(await fromDocx(buf));
    if (e === "xlsx" || mime.includes("spreadsheetml")) return cap(await fromXlsx(buf));
    if (e === "hwp" || e === "hwpx") return "(HWP 본문 추출 미지원)";
    if (["txt", "md", "markdown", "csv", "json", "tsv", "log", "yaml", "yml"].includes(e) || mime.startsWith("text/") || mime === "application/json") {
      return cap(buf.toString("utf8"));
    }
    // unknown: accept as text only if it does not look binary
    const s = buf.toString("utf8");
    const sample = s.slice(0, 2000);
    const binary = (sample.match(/[\u0000\uFFFD]/g)?.length ?? 0) > sample.length * 0.02;
    return binary ? `(${e || mime || "알 수 없는 형식"} 본문 추출 미지원)` : cap(s);
  } catch (err) {
    return `(본문 추출 실패: ${(err as Error).message.slice(0, 200)})`;
  }
}

function cap(s: string): string {
  const t = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_ATTACHMENT_TEXT ? t.slice(0, MAX_ATTACHMENT_TEXT) + "\n…(이하 생략)" : t;
}

async function fromPdf(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const r = await parser.getText();
    return r.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function fromDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

async function fromXlsx(buf: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(`## 시트: ${ws.name}`);
    ws.eachRow((row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => cellText(v));
      out.push(cells.join(","));
    });
    out.push("");
  });
  return out.join("\n");
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return JSON.stringify(v);
  }
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
