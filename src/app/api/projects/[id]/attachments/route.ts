import { handler, ok, bad, notFound, type Params } from "@/lib/http";
import { projects, attachments, activity } from "@/lib/repo";
import { extractText } from "@/lib/attachments";

const MAX_FILES = 10;
const MAX_SIZE = 25 * 1024 * 1024;

/** GET → attachments (without full text, only preview length) */
export const GET = handler(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  return ok(attachments.list(id).map(({ text, ...a }) => ({ ...a, textLength: text.length, preview: text.slice(0, 200) })));
});

/** POST multipart (files[]) → extracted attachments */
export const POST = handler(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!projects.get(id)) return notFound();
  const fd = await req.formData().catch(() => null);
  if (!fd) return bad("multipart/form-data 형식이어야 합니다");
  const files = [...fd.getAll("files"), ...fd.getAll("file")].filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return bad("파일이 없습니다");
  if (files.length > MAX_FILES) return bad(`최대 ${MAX_FILES}개까지 첨부할 수 있습니다`);
  const out = [];
  for (const f of files) {
    if (f.size > MAX_SIZE) return bad(`${f.name}: 25MB를 초과합니다`);
    const buf = Buffer.from(await f.arrayBuffer());
    const text = await extractText(f.name, f.type, buf);
    const a = attachments.create({ projectId: id, name: f.name, mime: f.type || "application/octet-stream", size: f.size, text });
    activity.log(id, "attachment.add", f.name, { size: f.size, textLength: text.length });
    out.push(a);
  }
  return ok(out, { status: 201 });
});
