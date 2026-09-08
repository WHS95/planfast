import type { Page } from "@/lib/types";

export interface SpecRef { id: string; title: string; featureTitle: string }
export type ViewMode = "detail" | "simple";

/** AI 제안: 트리(신규 페이지) 또는 보강(기존 페이지 수정) */
export interface ProposedPage { key: string; name: string; description: string; checked: boolean; children: ProposedPage[] }
export interface ProposedLink { pageId: string; specIds: string[]; checked: boolean }
export type IaProposal =
  | { kind: "tree"; parentId: string | null; pages: ProposedPage[] }
  | { kind: "enrich"; updates: { id: string; name: string; description: string; checked: boolean }[] }
  | { kind: "link"; links: ProposedLink[] };

export function childrenOf(pages: Page[], parentId: string | null): Page[] {
  return pages.filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}
export function descendantIds(pages: Page[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (pid: string) => { for (const c of pages) if (c.parentId === pid && !out.has(c.id)) { out.add(c.id); walk(c.id); } };
  walk(id);
  return out;
}
export function depthOf(pages: Page[], p: Page): number {
  let d = 0; let cur: Page | undefined = p;
  while (cur?.parentId) { d++; cur = pages.find((x) => x.id === cur!.parentId); if (d > 20) break; }
  return d;
}
/** depth-first ordered list for the side panel */
export function flatten(pages: Page[]): { page: Page; depth: number }[] {
  const out: { page: Page; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => { for (const c of childrenOf(pages, parentId)) { out.push({ page: c, depth }); walk(c.id, depth + 1); } };
  walk(null, 0);
  // orphans (parent missing) appended as roots
  const seen = new Set(out.map((o) => o.page.id));
  for (const p of pages) if (!seen.has(p.id)) out.push({ page: p, depth: 0 });
  return out;
}
